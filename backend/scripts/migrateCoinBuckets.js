/**
 * Zeebac coin-bucket migration.
 *
 * Splits every vendor wallet's single balance into
 *   purchasedPoints (coins bought) | earnedCoins (coins redeemed at the store) | cashEarnings (real money received)
 * by replaying each wallet's transaction history in order with the new rules:
 *   credits : top-ups → purchased, payment_received → cash, points_redeemed / vendor cashback / refunds → earned
 *   debits  : cashback → earned then purchased; everything else (withdrawal, subscription, fees, purchase)
 *             → cash then purchased. Withdrawal-reject refunds restore the exact split of that withdrawal.
 * Where history paid something from a bucket that had nothing left (the old single balance allowed it),
 * the shortfall is taken from the remaining buckets and reported as "overflow".
 *
 * Decisions applied (approved 28 Nov 2026):
 *   - Demo stores ZBV-1001 … ZBV-1012: balance reset to what their transaction history explains
 *     (the unexplained ₹35,000 seed is removed with an audited `migration_adjustment` row).
 *   - HRX Lifestyle (ZBV-8382): NOT migrated until its ₹20,230 unexplained balance is verified.
 *   - Any other wallet whose balance does not match its history is skipped and reported.
 *
 * DEFAULT IS A DRY RUN — nothing is written.
 *   node scripts/migrateCoinBuckets.js [--out <dir>]   → dry run, prints the plan, writes the plan JSON to <dir>
 *   node scripts/migrateCoinBuckets.js --apply --plan <report.json>
 *                                                      → applies EXACTLY the reviewed plan; aborts if any
 *                                                        wallet changed since the dry run.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_ZEEBAC_IDS = Array.from({ length: 12 }, (_, i) => `ZBV-${1001 + i}`);
const HOLD_ZEEBAC_IDS = ['ZBV-8382'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const CREDIT_BUCKET = {
  settlement: 'purchasedPoints',
  reserve_topup: 'purchasedPoints',
  cashin: 'purchasedPoints',
  recharge: 'purchasedPoints',
  payment_received: 'cashEarnings',
  extra_order_fee_reversal: 'cashEarnings',
  points_redeemed: 'earnedCoins',
  cashback: 'earnedCoins',
  refund: 'earnedCoins',
};
const COIN_DEBIT = new Set(['cashback', 'cashback_payout']);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const planPath = args.includes('--plan') ? args[args.indexOf('--plan') + 1] : null;
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : process.cwd();

// A payment_received credit is real money only if the customer/merchant did NOT pay with wallet coins.
// processWalletPayment (customer paid the store with coins) also wrote `payment_received` before this
// change — those are coins redeemed at the store → earnedCoins.
const isCoinPayment = (t, txById) => {
  if (t.category !== 'payment_received') return false;
  const linked = t.referenceId ? txById.get(String(t.referenceId)) : null;
  if (linked) return linked.paymentMethod === 'Wallet' && linked.type !== 'merchant_payment' && !/merchant/i.test(t.description || '');
  return /\(Wallet\)\s*$/.test(t.description || '');
};

const replay = (txs, txById = new Map()) => {
  const b = { purchasedPoints: 0, earnedCoins: 0, cashEarnings: 0 };
  const withdrawalSplit = new Map();
  const overflow = [];
  for (const t of txs) {
    const amt = r2(t.amount);
    if (t.type === 'credit') {
      if (t.referenceType === 'WithdrawalRequest' && withdrawalSplit.has(String(t.referenceId))) {
        const sp = withdrawalSplit.get(String(t.referenceId));
        for (const k of Object.keys(sp)) b[k] = r2(b[k] + sp[k]);
        continue;
      }
      const k = isCoinPayment(t, txById) ? 'earnedCoins' : CREDIT_BUCKET[t.category] || 'earnedCoins';
      b[k] = r2(b[k] + amt);
    } else {
      const order = COIN_DEBIT.has(t.category) ? ['earnedCoins', 'purchasedPoints', 'cashEarnings'] : ['cashEarnings', 'purchasedPoints', 'earnedCoins'];
      let left = amt;
      const split = {};
      for (const [i, k] of order.entries()) {
        const take = r2(Math.min(left, Math.max(0, b[k])));
        if (take > 0) {
          b[k] = r2(b[k] - take);
          split[k] = take;
          left = r2(left - take);
          if (i >= 2) overflow.push({ at: t.createdAt, category: t.category, amount: take, from: k });
        }
        if (left <= 0) break;
      }
      if (left > 0) {
        overflow.push({ at: t.createdAt, category: t.category, amount: left, from: 'NEGATIVE' });
        b[order[0]] = r2(b[order[0]] - left);
      }
      if (t.category === 'withdrawal' && t.referenceId) withdrawalSplit.set(String(t.referenceId), split);
    }
  }
  return { buckets: b, overflow };
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const vendors = new Map((await db.collection('vendors').find({}, { projection: { storeName: 1, zeebacId: 1 } }).toArray()).map((v) => [String(v._id), v]));
  const wallets = await db.collection('wallets').find({ ownerType: { $in: ['Vendor', 'vendor'] } }).toArray();

  const plan = [];
  for (const w of wallets) {
    const v = vendors.get(String(w.ownerId)) || {};
    const txs = await db.collection('wallettransactions').find({ walletId: w._id }).sort({ createdAt: 1, _id: 1 }).toArray();
    const historyNet = r2(txs.reduce((s, t) => s + (t.type === 'credit' ? t.amount : -t.amount), 0));
    const unexplained = r2((w.balance || 0) - historyNet);
    const refIds = txs.filter((t) => t.category === 'payment_received' && t.referenceId).map((t) => t.referenceId);
    const linked = refIds.length
      ? await db.collection('transactions').find({ _id: { $in: refIds } }, { projection: { paymentMethod: 1, type: 1 } }).toArray()
      : [];
    const txById = new Map(linked.map((x) => [String(x._id), x]));
    const { buckets, overflow } = replay(txs, txById);
    const coinPayments = txs.filter((t) => isCoinPayment(t, txById));
    const row = {
      walletId: String(w._id),
      vendorId: String(w.ownerId),
      zeebacId: v.zeebacId || null,
      storeName: v.storeName || null,
      currentBalance: r2(w.balance),
      historyNet,
      unexplained,
      alreadyMigrated: Number(w.bucketsVersion || 0) >= 1,
      proposed: null,
      adjustment: 0,
      overflow,
      action: '',
      reason: '',
      walletUpdatedAt: w.updatedAt ? new Date(w.updatedAt).toISOString() : null,
      coinPaymentsReclassified: coinPayments.length ? { count: coinPayments.length, amount: r2(coinPayments.reduce((s, t) => s + t.amount, 0)) } : null,
    };
    if (row.alreadyMigrated) {
      row.action = 'SKIP';
      row.reason = 'already migrated';
    } else if (HOLD_ZEEBAC_IDS.includes(row.zeebacId)) {
      row.action = 'HOLD';
      row.reason = `unexplained ₹${unexplained} — waiting for payment verification (not migrated, keeps legacy behaviour)`;
    } else if (DEMO_ZEEBAC_IDS.includes(row.zeebacId)) {
      row.action = 'RESET_DEMO';
      row.adjustment = r2(-unexplained);
      row.adjustments = unexplained !== 0
        ? [
            { kind: 'UNRECORDED_OPENING_BALANCE', amount: r2(unexplained) },
            { kind: 'DEMO_SEED_REMOVED', amount: r2(-unexplained) },
          ]
        : [];
      row.proposed = { balance: historyNet, ...buckets };
      row.reason = unexplained !== 0 ? `demo store: remove unexplained ₹${unexplained}` : 'demo store: history already matches';
    } else if (Math.abs(unexplained) > 0.009) {
      row.action = 'HOLD';
      row.reason = `balance does not match history (unexplained ₹${unexplained}) — needs review`;
    } else {
      row.action = 'MIGRATE';
      row.proposed = { balance: historyNet, ...buckets };
      row.reason = 'history matches balance';
    }
    if (row.proposed) {
      const sum = r2(row.proposed.purchasedPoints + row.proposed.earnedCoins + row.proposed.cashEarnings);
      if (sum !== row.proposed.balance) {
        row.action = 'HOLD';
        row.reason = `internal check failed: buckets ${sum} ≠ balance ${row.proposed.balance}`;
        row.proposed = null;
      } else if (Object.values(buckets).some((x) => x < 0)) {
        if (row.action === 'RESET_DEMO') {
          // Demo store whose real history is negative (it paid cashback out of the fake seed):
          // reset to an empty wallet — no negative balance, no debt.
          row.adjustment = r2(-row.currentBalance);
          // Two separate audited entries: the fake seed removed, and the negative real history written off.
          row.adjustments = [
            { kind: 'UNRECORDED_OPENING_BALANCE', amount: r2(unexplained) },
            { kind: 'DEMO_SEED_REMOVED', amount: r2(-unexplained) },
            { kind: 'NEGATIVE_HISTORY_WRITTEN_OFF', amount: r2(-historyNet) },
          ];
          row.proposed = { balance: 0, purchasedPoints: 0, earnedCoins: 0, cashEarnings: 0 };
          row.reason = `demo store: remove unexplained ₹${unexplained}; its real history is ₹${historyNet} (cashback paid from the demo seed), so the wallet is reset to ₹0`;
        } else {
          row.action = 'HOLD';
          row.reason = 'history would leave a negative bucket — needs review';
        }
      }
    }
    plan.push(row);
  }

  // Pending withdrawals (already deducted from balances; unaffected, listed for awareness)
  const pendingWd = await db.collection('withdrawalrequests').find({ status: 'Pending' }, { projection: { vendorId: 1, amount: 1 } }).toArray();
  const pendingTopups = await db.collection('pointstopuprequests').countDocuments({ status: 'PENDING' }).catch(() => 0);

  // ── Print ──
  const fmt = (n) => (n == null ? '-' : r2(n).toLocaleString('en-IN'));
  console.log(`\nZeebac coin-bucket migration — ${APPLY ? 'APPLY' : 'DRY RUN (no writes)'} — db "${db.databaseName}"`);
  console.table(
    plan.map((p) => ({
      store: `${p.storeName} (${p.zeebacId})`,
      action: p.action,
      balanceNow: fmt(p.currentBalance),
      balanceAfter: p.proposed && p.action !== 'HOLD' ? fmt(p.proposed.balance) : fmt(p.currentBalance),
      purchased: p.proposed ? fmt(p.proposed.purchasedPoints) : '-',
      earned: p.proposed ? fmt(p.proposed.earnedCoins) : '-',
      cash: p.proposed ? fmt(p.proposed.cashEarnings) : '-',
      adjustment: p.adjustment ? fmt(p.adjustment) : '',
      overflow: p.overflow.length ? fmt(p.overflow.reduce((s, o) => s + o.amount, 0)) : '',
    }))
  );
  for (const p of plan.filter((x) => x.action !== 'MIGRATE' || x.overflow.length)) {
    console.log(`• ${p.storeName} (${p.zeebacId}) — ${p.action}: ${p.reason}`);
    for (const o of p.overflow) console.log(`    overflow: ${o.category} ₹${o.amount} paid from ${o.from} (${new Date(o.at).toISOString().slice(0, 10)})`);
  }
  const changing = plan.filter((p) => p.proposed && ['MIGRATE', 'RESET_DEMO'].includes(p.action));
  const tot = (k) => r2(changing.reduce((s, p) => s + p.proposed[k], 0));
  console.log(`\nTotals after migration (migrated wallets): purchased ${fmt(tot('purchasedPoints'))} | earned ${fmt(tot('earnedCoins'))} | cash ${fmt(tot('cashEarnings'))}`);
  console.log(`Demo reset adjustments: ₹${fmt(plan.reduce((s, p) => s + p.adjustment, 0))} across ${plan.filter((p) => p.adjustment).length} wallets`);
  console.log(`On hold: ${plan.filter((p) => p.action === 'HOLD').map((p) => p.zeebacId).join(', ') || 'none'}`);
  console.log(`Pending withdrawals (unaffected): ${pendingWd.length} totalling ₹${fmt(pendingWd.reduce((s, w) => s + w.amount, 0))} | pending UPI top-ups: ${pendingTopups}`);

  if (!APPLY) {
    const out = path.resolve(outDir, `coin-bucket-plan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), db: db.databaseName, plan }, null, 2));
    console.log(`\nDry run only — nothing was written to the database.\nPlan saved to ${out}\nTo apply exactly this plan: node scripts/migrateCoinBuckets.js --apply --plan "${out}"`);
    await mongoose.disconnect();
    return;
  }

  // ── APPLY: only the reviewed plan, only if nothing changed since ──
  if (!planPath) throw new Error('--apply requires --plan <file> from a reviewed dry run');
  const reviewed = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const byWallet = new Map(plan.map((p) => [p.walletId, p]));
  for (const rp of reviewed.plan) {
    const now = byWallet.get(rp.walletId);
    if (!now || now.currentBalance !== rp.currentBalance || now.action !== rp.action || JSON.stringify(now.proposed) !== JSON.stringify(rp.proposed)) {
      throw new Error(`Wallet ${rp.walletId} (${rp.zeebacId}) changed since the dry run — re-run the dry run and review again. Nothing was written.`);
    }
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const p of reviewed.plan) {
        if (!['MIGRATE', 'RESET_DEMO'].includes(p.action) || !p.proposed) continue;
        const _id = new mongoose.Types.ObjectId(p.walletId);
        // Compare rounded values (stored balances can carry float noise like 802.0500000000002),
        // then update against the exact stored value so a concurrent change still aborts.
        const live = await db.collection('wallets').findOne({ _id }, { session });
        if (!live || r2(live.balance) !== p.currentBalance || Number(live.bucketsVersion || 0) >= 1) {
          throw new Error(`Wallet ${p.walletId} (${p.zeebacId}) changed since the dry run — rolled back`);
        }
        const res = await db.collection('wallets').updateOne(
          { _id, balance: live.balance, bucketsVersion: { $in: [null, 0] } },
          { $set: { balance: p.proposed.balance, purchasedPoints: p.proposed.purchasedPoints, earnedCoins: p.proposed.earnedCoins, cashEarnings: p.proposed.cashEarnings, bucketsVersion: 1, bucketsMigratedAt: new Date() } },
          { session }
        );
        if (res.modifiedCount !== 1) throw new Error(`Wallet ${p.walletId} changed during apply — rolled back`);
        // Start from what the recorded history explains; the opening-balance row brings it to today's
        // balance, the removal / write-off rows bring it to the proposed balance. History then reconciles.
        let running = p.historyNet;
        for (const adj of p.adjustments || []) {
          running = r2(running + adj.amount);
          await db.collection('wallettransactions').insertOne(
            {
              walletId: _id,
              ownerId: new mongoose.Types.ObjectId(p.vendorId),
              ownerType: 'Vendor',
              type: adj.amount < 0 ? 'debit' : 'credit',
              category: 'migration_adjustment',
              amount: Math.abs(adj.amount),
              balanceAfter: running,
              description: {
                UNRECORDED_OPENING_BALANCE: `Coin migration: demo opening balance of ₹${Math.abs(adj.amount)} that was never recorded as a transaction (recorded now for the audit trail)`,
                DEMO_SEED_REMOVED: `Coin migration: demo seed balance removed (₹${Math.abs(adj.amount)} had no payment behind it)`,
                NEGATIVE_HISTORY_WRITTEN_OFF: `Coin migration: negative history written off (₹${Math.abs(adj.amount)} of cashback was paid from the demo seed; wallet reset to ₹0, no debt)`,
              }[adj.kind],
              status: 'Success',
              idempotencyKey: `COIN_MIGRATION:${p.walletId}:${adj.kind}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { session }
          );
        }
        if (r2(running) !== r2(p.proposed.balance)) throw new Error(`Adjustments for ${p.walletId} do not reach the proposed balance`);
        await db.collection('adminauditlogs').insertOne(
          { action: 'COIN_BUCKET_MIGRATION', entityType: 'Wallet', entityId: p.walletId, vendorId: new mongoose.Types.ObjectId(p.vendorId), amount: p.adjustment, before: { balance: p.currentBalance }, after: p.proposed, meta: { reason: p.reason, adjustments: p.adjustments || [], coinPaymentsReclassified: p.coinPaymentsReclassified, overflow: p.overflow, plan: path.basename(planPath) }, createdAt: new Date(), updatedAt: new Date() },
          { session }
        );
      }
    });
    console.log('\nApplied. Every change is in one transaction and recorded in the admin audit log.');
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
};

main().catch(async (err) => {
  console.error(`\nMigration aborted: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
