import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';

// Thrown when a debit is attempted against a wallet that doesn't have enough
// balance. Callers should catch this specifically to return a clean 400
// instead of a generic 500.
export class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

// Thrown when a gateway payment (Razorpay order/payment id) has already been
// processed once before — protects every payment-verification endpoint from
// double-crediting on a retried/replayed request.
export class DuplicatePaymentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicatePaymentError';
  }
}

// ─── Vendor coin buckets ──────────────────────────────────────────────────────
// A vendor wallet with bucketsVersion >= 1 keeps three separate balances:
//   purchasedPoints – coins bought from Zeebac (Razorpay / admin-approved UPI)
//   earnedCoins     – coins customers spent at this store (never withdrawable)
//   cashEarnings    – real money received from customers / merchants (never used for cashback)
// balance is always purchasedPoints + earnedCoins + cashEarnings and can never go negative.
// Wallets with bucketsVersion 0 (not migrated yet) keep the old single-balance behaviour.

export const BUCKETS = ['purchasedPoints', 'earnedCoins', 'cashEarnings'];

// Coins used for customer cashback: earned first, then purchased. Cash earnings never.
const COIN_DEBIT_CATEGORIES = new Set(['cashback', 'cashback_payout']);
// Everything else a vendor pays (subscription, fees, withdrawals, merchant payments) is money:
// cash earnings first, then purchased coins. Earned coins are never converted to money.
const COIN_ORDER = ['earnedCoins', 'purchasedPoints'];
const MONEY_ORDER = ['cashEarnings', 'purchasedPoints'];

const CREDIT_BUCKET_BY_CATEGORY = {
  settlement: 'purchasedPoints', // Razorpay coin top-up (and legacy withdrawal-reject refund — callers pass an explicit split)
  reserve_topup: 'purchasedPoints', // admin-approved UPI coin top-up
  cashin: 'purchasedPoints', // Razorpay webhook top-up
  recharge: 'purchasedPoints',
  payment_received: 'cashEarnings', // real money received
  extra_order_fee_reversal: 'cashEarnings',
  points_redeemed: 'earnedCoins', // customer spent coins at this store
  cashback: 'earnedCoins', // cashback coins this vendor received from another merchant
  refund: 'earnedCoins', // cashback reversal — returned as non-withdrawable coins (never creates withdrawable money)
};

export const debitOrderForCategory = (category) => (COIN_DEBIT_CATEGORIES.has(category) ? COIN_ORDER : MONEY_ORDER);
export const creditBucketForCategory = (category) => CREDIT_BUCKET_BY_CATEGORY[category] || 'earnedCoins';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isVendorType = (t) => String(t || '').toLowerCase() === 'vendor';
const isBucketed = (w) => Number(w?.bucketsVersion || 0) >= 1;
const vendorTypeQuery = { $in: ['vendor', 'VENDOR', 'Vendor'] };
// Driver v5 returns { value, ok }, v6 returns the document.
const unwrap = (r) => (r && typeof r === 'object' && 'ok' in r && 'value' in r ? r.value : r);

const findOrCreateVendorWallet = async ({ ownerId, ownerZeebacId, session }) => {
  // New vendor wallets start at 0 with buckets enforced (no free starting balance).
  return Wallet.findOneAndUpdate(
    { ownerId, ownerType: vendorTypeQuery },
    {
      $setOnInsert: {
        ownerType: 'Vendor',
        ownerZeebacId: ownerZeebacId || 'VENDOR',
        balance: 0,
        purchasedPoints: 0,
        earnedCoins: 0,
        cashEarnings: 0,
        bucketsVersion: 1,
      },
    },
    { returnDocument: 'after', upsert: true, session }
  );
};

/**
 * Atomic two-bucket debit. `take` = 'all' requires the full amount; 'upTo' takes what is available.
 * Returns { wallet(after), taken, split } or null when nothing could be taken.
 */
const bucketDebit = async ({ walletId, amount, order, session, take = 'all' }) => {
  const [b1, b2] = order;
  const f1 = { $ifNull: [`$${b1}`, 0] };
  const f2 = { $ifNull: [`$${b2}`, 0] };
  const avail = { $add: [f1, f2] };
  const takeExpr = take === 'all' ? amount : { $min: [amount, avail] };
  const filter =
    take === 'all'
      ? { _id: walletId, $expr: { $gte: [avail, amount] } }
      : { _id: walletId, $expr: { $gt: [avail, 0] } };
  const before = unwrap(
    await Wallet.collection.findOneAndUpdate(
      filter,
      [
        { $set: { __take: takeExpr } },
        { $set: { __t1: { $min: [f1, '$__take'] } } },
        {
          $set: {
            [b1]: { $round: [{ $subtract: [f1, '$__t1'] }, 2] },
            [b2]: { $round: [{ $subtract: [f2, { $subtract: ['$__take', '$__t1'] }] }, 2] },
            balance: { $round: [{ $subtract: [{ $ifNull: ['$balance', 0] }, '$__take'] }, 2] },
            totalWithdrawn: { $round: [{ $add: [{ $ifNull: ['$totalWithdrawn', 0] }, '$__take'] }, 2] },
          },
        },
        { $unset: ['__take', '__t1'] },
      ],
      { returnDocument: 'before', session, includeResultMetadata: false }
    )
  );
  if (!before) return null;
  const a1 = Number(before[b1]) || 0;
  const a2 = Number(before[b2]) || 0;
  const taken = r2(take === 'all' ? amount : Math.min(amount, a1 + a2));
  const t1 = r2(Math.min(a1, taken));
  const split = { [b1]: t1, [b2]: r2(taken - t1) };
  const after = { ...before, [b1]: r2(a1 - t1), [b2]: r2(a2 - (taken - t1)), balance: r2((Number(before.balance) || 0) - taken) };
  return { wallet: after, taken, split };
};

// Atomically decrements a wallet's balance and writes the matching ledger row.
// MUST be called inside an active Mongoose session (session.withTransaction).
// Vendor wallets with buckets: amount comes from the category's buckets and can
// never go negative (allowNegativeBalance is ignored). Legacy wallets keep the
// old behaviour, including the explicit allowNegativeBalance opt-in.
export const debitWallet = async ({
  session, ownerId, ownerType, ownerZeebacId, amount, category, description,
  referenceId, referenceType, gateway = {}, allowNegativeBalance = false, buckets = null,
}) => {
  const normalizedType = (ownerType || 'vendor').toLowerCase();
  const ownerTypeQuery = (normalizedType === 'user' || normalizedType === 'customer')
    ? { $in: ['User', 'user', 'Customer', 'customer'] }
    : { $in: [normalizedType, normalizedType.toUpperCase(), normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)] };
  const resolvedOwnerType = normalizedType === 'admin' ? 'Admin' : (normalizedType === 'vendor' ? 'Vendor' : 'User');
  const cleanAmount = r2(amount);

  let wallet;
  if (isVendorType(ownerType)) {
    wallet = await findOrCreateVendorWallet({ ownerId, ownerZeebacId, session });
  } else {
    wallet = await Wallet.findOne({ ownerId, ownerType: ownerTypeQuery }).session(session);
    if (!wallet) {
      // Users / admin keep their historical auto-initialisation.
      const initialBalance = normalizedType === 'admin' ? 500000 : 1000;
      const created = await Wallet.create([{
        ownerId,
        ownerType: resolvedOwnerType,
        ownerZeebacId: normalizedType === 'admin' ? 'ZEEBAC-ADMIN' : 'USER-INIT',
        balance: initialBalance,
        totalEarned: initialBalance,
        totalWithdrawn: 0,
      }], { session });
      wallet = created[0];
    }
  }

  // ── Vendor bucket path ──
  if (isVendorType(ownerType) && isBucketed(wallet)) {
    const res = await bucketDebit({ walletId: wallet._id, amount: cleanAmount, order: buckets || debitOrderForCategory(category), session });
    if (!res) {
      throw new InsufficientBalanceError(
        COIN_DEBIT_CATEGORIES.has(category)
          ? 'Insufficient coin balance for cashback'
          : 'Insufficient wallet balance'
      );
    }
    await WalletTransaction.create([{
      walletId: wallet._id,
      ownerId,
      ownerType: resolvedOwnerType,
      type: 'debit',
      category: category || 'cashback',
      amount: cleanAmount,
      balanceAfter: res.wallet.balance,
      referenceId,
      referenceType,
      description,
      bucketSplit: res.split,
      ...gateway,
    }], { session });
    return Wallet.hydrate(res.wallet);
  }

  // ── Legacy path (unchanged) ──
  const filter = allowNegativeBalance
    ? { _id: wallet._id }
    : { _id: wallet._id, balance: { $gte: cleanAmount } };

  const updatedWallet = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { balance: -cleanAmount, totalWithdrawn: cleanAmount } },
    { returnDocument: 'after', session, runValidators: true }
  );

  if (!updatedWallet) {
    throw new InsufficientBalanceError(`Insufficient wallet balance for ${ownerType} ${ownerId}`);
  }

  await WalletTransaction.create([{
    walletId: updatedWallet._id,
    ownerId,
    ownerType: resolvedOwnerType,
    type: 'debit',
    category: category || 'cashback',
    amount,
    balanceAfter: updatedWallet.balance,
    referenceId,
    referenceType,
    description,
    ...gateway,
  }], { session });

  return updatedWallet;
};

/**
 * Cashback funding: takes up to `amount` coins from the vendor (earned first, then purchased)
 * and returns how much was actually taken. Never throws for lack of funds and never goes
 * negative on a migrated wallet — cashback simply stops when the vendor has no coins.
 * Legacy (unmigrated) wallets keep the old behaviour: full amount, honouring allowNegativeBalance.
 * @returns {Promise<{ amount: number, split: object|null }>}
 */
export const debitVendorCashbackCoins = async ({
  session, vendorId, ownerZeebacId, amount, category = 'cashback', description, referenceId, referenceType, allowNegativeBalance = false,
}) => {
  const cleanAmount = r2(amount);
  if (!(cleanAmount > 0)) return { amount: 0, split: null };
  const wallet = await findOrCreateVendorWallet({ ownerId: vendorId, ownerZeebacId, session });

  if (!isBucketed(wallet)) {
    try {
      await debitWallet({ session, ownerId: vendorId, ownerType: 'Vendor', amount: cleanAmount, category, description, referenceId, referenceType, allowNegativeBalance });
      return { amount: cleanAmount, split: null };
    } catch (err) {
      if (err instanceof InsufficientBalanceError) return { amount: 0, split: null };
      throw err;
    }
  }

  const res = await bucketDebit({ walletId: wallet._id, amount: cleanAmount, order: COIN_ORDER, session, take: 'upTo' });
  if (!res || !(res.taken > 0)) return { amount: 0, split: null };
  await WalletTransaction.create([{
    walletId: wallet._id,
    ownerId: vendorId,
    ownerType: 'Vendor',
    type: 'debit',
    category,
    amount: res.taken,
    balanceAfter: res.wallet.balance,
    referenceId,
    referenceType,
    description: res.taken < cleanAmount ? `${description} (limited to available coins: ${res.taken} of ${cleanAmount})` : description,
    bucketSplit: res.split,
  }], { session });
  return { amount: res.taken, split: res.split };
};

// Atomically increments a wallet's balance (creating the wallet on first use)
// and writes the matching ledger row. MUST be called inside an active
// Mongoose session. Vendor wallets with buckets: the credit goes to the
// category's bucket, or to the explicit `split` / `bucket` given by the caller.
export const creditWallet = async ({
  session, ownerId, ownerType, ownerZeebacId, amount, category, description,
  referenceId, referenceType, gateway = {}, lockedUntil = null, bucket = null, split = null, idempotencyKey,
}) => {
  const cleanAmount = r2(amount);
  const normalizedType = (ownerType || 'customer').toLowerCase();
  const ownerTypeQuery = (normalizedType === 'user' || normalizedType === 'customer')
    ? { $in: ['User', 'user', 'Customer', 'customer'] }
    : { $in: [normalizedType, normalizedType.toUpperCase(), normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)] };
  const resolvedOwnerType = normalizedType === 'admin' ? 'Admin' : (normalizedType === 'vendor' ? 'Vendor' : 'User');

  let wallet;
  let bucketSplit;
  if (isVendorType(ownerType)) {
    const existing = await findOrCreateVendorWallet({ ownerId, ownerZeebacId, session });
    if (isBucketed(existing)) {
      const parts = split
        ? Object.fromEntries(BUCKETS.map((b) => [b, r2(split[b] || 0)]))
        : { [bucket || creditBucketForCategory(category)]: cleanAmount };
      const sum = r2(Object.values(parts).reduce((s, v) => s + v, 0));
      if (sum !== cleanAmount) throw new Error(`creditWallet: split ${sum} does not equal amount ${cleanAmount}`);
      const inc = { balance: cleanAmount, totalEarned: cleanAmount };
      for (const [b, v] of Object.entries(parts)) if (v) inc[b] = v;
      wallet = await Wallet.findOneAndUpdate({ _id: existing._id }, { $inc: inc }, { returnDocument: 'after', session });
      bucketSplit = parts;
    } else {
      wallet = await Wallet.findOneAndUpdate(
        { _id: existing._id },
        { $inc: { balance: cleanAmount, totalEarned: cleanAmount } },
        { returnDocument: 'after', session }
      );
    }
  } else {
    wallet = await Wallet.findOneAndUpdate(
      { ownerId, ownerType: ownerTypeQuery },
      {
        $inc: { balance: cleanAmount, totalEarned: cleanAmount },
        $setOnInsert: { ownerZeebacId, ownerType: resolvedOwnerType },
      },
      { returnDocument: 'after', upsert: true, session, runValidators: true }
    );
  }

  await WalletTransaction.create([{
    walletId: wallet._id,
    ownerId,
    ownerType: resolvedOwnerType,
    type: 'credit',
    category: category || 'cashback',
    amount: cleanAmount,
    balanceAfter: wallet.balance,
    referenceId,
    referenceType,
    description,
    lockedUntil,
    ...(bucketSplit ? { bucketSplit } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...gateway,
  }], { session });

  return wallet;
};

/** Read-only view of a vendor wallet's buckets. */
export const getVendorCoinSummary = (wallet) => {
  const bucketed = isBucketed(wallet);
  const purchased = r2(wallet?.purchasedPoints || 0);
  const earned = r2(wallet?.earnedCoins || 0);
  const cash = r2(wallet?.cashEarnings || 0);
  return {
    bucketed,
    balance: r2(wallet?.balance || 0),
    purchasedCoins: bucketed ? purchased : null,
    earnedCoins: bucketed ? earned : null,
    cashEarnings: bucketed ? cash : null,
    cashbackCoinsAvailable: bucketed ? r2(purchased + earned) : r2(Math.max(0, wallet?.balance || 0)),
    withdrawable: bucketed ? r2(purchased + cash) : r2(Math.max(0, wallet?.balance || 0)),
  };
};

// Reserves a gateway payment id so it can only ever be credited once. Call
// this first, inside the session, before doing anything else with a
// Razorpay payment — throws DuplicatePaymentError if it's already been used.
// Relies on the unique sparse index on WalletTransaction.gatewayPaymentId as
// the hard backstop; this check just gives a clean error instead of a raw
// duplicate-key exception.
export const assertGatewayPaymentNotProcessed = async (session, gatewayPaymentId) => {
  const existing = await WalletTransaction.findOne({ gatewayPaymentId }).session(session);
  if (existing) {
    throw new DuplicatePaymentError(`Payment ${gatewayPaymentId} has already been processed`);
  }
};

/**
 * Vendor withdrawal debit on a bucketed wallet: cash earnings first, then purchased coins.
 * Earned coins are never touched. Returns { wallet, split } or null when not enough.
 */
export const debitVendorWithdrawableBuckets = async ({ walletId, amount, session }) =>
  bucketDebit({ walletId, amount: r2(amount), order: MONEY_ORDER, session });

export const isBucketedWallet = isBucketed;
