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

// Atomically decrements a wallet's balance and writes the matching ledger row.
// MUST be called inside an active Mongoose session (session.withTransaction).
// The balance check and the decrement happen in a single findOneAndUpdate, so
// two concurrent debits against the same wallet can never both succeed past
// the point where funds run out (no read-then-write race).
export const debitWallet = async ({
  session, ownerId, ownerType, amount, category, description,
  referenceId, referenceType, gateway = {},
}) => {
  const normalizedType = (ownerType || 'vendor').toLowerCase();
  const ownerTypeQuery = { $in: [normalizedType, normalizedType.toUpperCase(), normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)] };

  // Ensure wallet exists (if missing, auto-initialize vendor with ₹25,000 balance)
  let wallet = await Wallet.findOne({ ownerId, ownerType: ownerTypeQuery }).session(session);
  if (!wallet) {
    const initialBalance = normalizedType === 'vendor' ? 25000 : 1000;
    const created = await Wallet.create([{
      ownerId,
      ownerType: normalizedType,
      balance: initialBalance,
      totalEarned: initialBalance,
      totalWithdrawn: 0
    }], { session });
    wallet = created[0];
  }

  const updatedWallet = await Wallet.findOneAndUpdate(
    { _id: wallet._id, balance: { $gte: amount } },
    { $inc: { balance: -amount, totalWithdrawn: amount } },
    { returnDocument: 'after', session, runValidators: true }
  );

  if (!updatedWallet) {
    throw new InsufficientBalanceError(`Insufficient wallet balance for ${ownerType} ${ownerId}`);
  }

  await WalletTransaction.create([{
    walletId: updatedWallet._id,
    ownerId,
    ownerType: normalizedType === 'vendor' ? 'Vendor' : 'User',
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

// Atomically increments a wallet's balance (creating the wallet on first use)
// and writes the matching ledger row. MUST be called inside an active
// Mongoose session.
export const creditWallet = async ({
  session, ownerId, ownerType, ownerZeebacId, amount, category, description,
  referenceId, referenceType, gateway = {},
}) => {
  const normalizedType = (ownerType || 'customer').toLowerCase();
  const ownerTypeQuery = { $in: [normalizedType, normalizedType.toUpperCase(), normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)] };

  const wallet = await Wallet.findOneAndUpdate(
    { ownerId, ownerType: ownerTypeQuery },
    {
      $inc: { balance: amount, totalEarned: amount },
      $setOnInsert: { ownerZeebacId, ownerType: normalizedType === 'vendor' ? 'Vendor' : 'User' },
    },
    { returnDocument: 'after', upsert: true, session, runValidators: true }
  );

  await WalletTransaction.create([{
    walletId: wallet._id,
    ownerId,
    ownerType: normalizedType === 'vendor' ? 'Vendor' : 'User',
    type: 'credit',
    category: category || 'cashback',
    amount,
    balanceAfter: wallet.balance,
    referenceId,
    referenceType,
    description,
    ...gateway,
  }], { session });

  return wallet;
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
