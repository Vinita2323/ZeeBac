import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { debitWallet, creditWallet, InsufficientBalanceError, assertGatewayPaymentNotProcessed, DuplicatePaymentError } from './wallet.util.js';

const asId = () => new mongoose.Types.ObjectId();

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

describe('creditWallet', () => {
  it('creates the wallet on first use and writes a matching ledger row', async () => {
    const ownerId = asId();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await creditWallet({
          session, ownerId, ownerType: 'User', ownerZeebacId: 'ZBC-TEST',
          amount: 100, category: 'cashback', description: 'test credit',
        });
      });
    } finally {
      session.endSession();
    }

    const wallet = await Wallet.findOne({ ownerId, ownerType: 'User' });
    expect(wallet.balance).toBe(100);

    const ledger = await WalletTransaction.find({ walletId: wallet._id });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('credit');
    expect(ledger[0].balanceAfter).toBe(100);
  });
});

describe('debitWallet', () => {
  it('throws InsufficientBalanceError and writes no ledger row when the balance is too low', async () => {
    const ownerId = asId();
    await Wallet.create({ ownerId, ownerType: 'Vendor', ownerZeebacId: 'ZBV-TEST', balance: 10 });

    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await debitWallet({ session, ownerId, ownerType: 'Vendor', amount: 50, category: 'cashback', description: 'too much' });
      })
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    session.endSession();

    const wallet = await Wallet.findOne({ ownerId, ownerType: 'Vendor' });
    expect(wallet.balance).toBe(10); // unchanged
    const ledger = await WalletTransaction.find({ walletId: wallet._id });
    expect(ledger).toHaveLength(0);
  });

  // This is the regression test for the audit's core finding: every balance
  // mutation used to be a read-then-write with no session, so N concurrent
  // requests against the same wallet could all read the same starting
  // balance and all "succeed" — corrupting the balance or double-spending
  // funds that only existed once. debitWallet's atomic
  // `findOneAndUpdate({ balance: { $gte: amount } })` should make that
  // impossible: with exactly enough money for ONE debit, firing many
  // concurrent debits must let exactly one through.
  it('lets exactly one debit through when several race for the same limited balance', async () => {
    const ownerId = asId();
    await Wallet.create({ ownerId, ownerType: 'Vendor', ownerZeebacId: 'ZBV-RACE', balance: 100 });

    const attempts = 10;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, async () => {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await debitWallet({ session, ownerId, ownerType: 'Vendor', amount: 100, category: 'cashback', description: 'race' });
          });
        } finally {
          session.endSession();
        }
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(attempts - 1);
    failed.forEach((r) => expect(r.reason).toBeInstanceOf(InsufficientBalanceError));

    const wallet = await Wallet.findOne({ ownerId, ownerType: 'Vendor' });
    expect(wallet.balance).toBe(0); // exactly one debit landed, never negative

    const ledger = await WalletTransaction.find({ walletId: wallet._id });
    expect(ledger).toHaveLength(1); // exactly one ledger row, not zero and not ten
  });
});

describe('assertGatewayPaymentNotProcessed', () => {
  it('throws once a WalletTransaction already exists for that gateway payment id', async () => {
    const ownerId = asId();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await creditWallet({
          session, ownerId, ownerType: 'Vendor', ownerZeebacId: 'ZBV-PAY',
          amount: 500, category: 'settlement', description: 'recharge',
          gateway: { gatewayName: 'Razorpay', gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1' },
        });
      });
    } finally {
      session.endSession();
    }

    const checkSession = await mongoose.startSession();
    await expect(
      checkSession.withTransaction(async () => {
        await assertGatewayPaymentNotProcessed(checkSession, 'pay_1');
      })
    ).rejects.toBeInstanceOf(DuplicatePaymentError);
    checkSession.endSession();
  });
});
