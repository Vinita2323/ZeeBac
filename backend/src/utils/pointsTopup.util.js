/**
 * UPI top-ups (vendor coin purchase, customer wallet top-up) paid to Zeebac's UPI ID.
 * The payer submits the 12-digit UTR → PENDING. Coins are credited only when an admin has
 * checked the bank statement and approves. One UTR can back at most one PENDING/APPROVED
 * request (unique `activeUtr`), and approval is a single atomic PENDING → APPROVED claim,
 * so a UTR can never be credited twice.
 */
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import PointsTopupRequest from '../models/PointsTopupRequest.js';
import { creditWallet, isBucketedWallet } from './wallet.util.js';
import { runInTransaction } from './sellerSettlement.util.js';
import { r2 } from './orderPricing.util.js';

export class TopupError extends Error {
  constructor(message, code = 'TOPUP_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const isDuplicateKey = (err) => err && (err.code === 11000 || /E11000/.test(err.message || ''));
const UTR_RE = /^\d{12}$/;

export const submitTopupRequest = async ({ ownerType, owner, utr, amount, refId }) => {
  const cleanUtr = String(utr || '').trim();
  if (!UTR_RE.test(cleanUtr)) throw new TopupError('Invalid UPI Reference ID / UTR. Must be exactly 12 digits.', 'INVALID_UTR');
  const amt = r2(amount);
  if (!(amt >= 1)) throw new TopupError('Invalid amount', 'INVALID_AMOUNT');

  // Legacy instant-credit rows stored the UTR only in the description — block those too.
  const legacy = await WalletTransaction.findOne({ description: new RegExp(`UTR: ${cleanUtr}\\b`) }).select('_id');
  if (legacy) throw new TopupError('This UPI Reference ID has already been used.', 'DUPLICATE_UTR', 409);

  try {
    return await PointsTopupRequest.create({
      ownerType,
      ownerId: owner._id,
      ownerZeebacId: owner.zeebacId,
      ownerName: owner.storeName || owner.name || '',
      ownerPhone: owner.phone || '',
      amount: amt,
      utr: cleanUtr,
      activeUtr: cleanUtr,
      refId: refId || undefined,
      status: 'PENDING',
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new TopupError('This UPI Reference ID has already been submitted.', 'DUPLICATE_UTR', 409);
    throw err;
  }
};

export const approveTopupRequest = async ({ requestId, adminId, note }) =>
  runInTransaction(async (session) => {
    const opts = session ? { session } : {};
    const reqDoc = await PointsTopupRequest.findOneAndUpdate(
      { _id: requestId, status: 'PENDING' },
      { $set: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date(), adminNote: note || '' } },
      { ...opts, new: true }
    );
    if (!reqDoc) throw new TopupError('Request not found or already reviewed', 'ALREADY_REVIEWED', 409);

    const isVendor = reqDoc.ownerType === 'Vendor';
    const wallet = await creditWallet({
      session,
      ownerId: reqDoc.ownerId,
      ownerType: reqDoc.ownerType,
      ownerZeebacId: reqDoc.ownerZeebacId,
      amount: reqDoc.amount,
      category: isVendor ? 'reserve_topup' : 'recharge', // vendor → purchased coins
      description: isVendor
        ? `Zeebac coins purchased via UPI (UTR ${reqDoc.utr}) — approved by admin`
        : `Wallet top-up via UPI (UTR ${reqDoc.utr}) — approved by admin`,
      referenceId: reqDoc._id,
      referenceType: undefined,
      idempotencyKey: `UPI_TOPUP:${reqDoc._id}`,
    });
    // Legacy (unmigrated) vendor wallets track purchased coins in the same field.
    if (isVendor && !isBucketedWallet(wallet)) {
      await Wallet.updateOne({ _id: wallet._id }, { $inc: { purchasedPoints: reqDoc.amount } }, opts);
    }
    const tx = await WalletTransaction.findOne({ idempotencyKey: `UPI_TOPUP:${reqDoc._id}` }).select('_id').session(session || null);
    await PointsTopupRequest.updateOne({ _id: reqDoc._id }, { $set: { walletTransactionId: tx?._id } }, opts);
    return { request: reqDoc, balance: wallet.balance };
  });

export const rejectTopupRequest = async ({ requestId, adminId, note }) => {
  if (!note || String(note).trim().length < 3) throw new TopupError('Rejection reason is required', 'REASON_REQUIRED');
  const reqDoc = await PointsTopupRequest.findOneAndUpdate(
    { _id: requestId, status: 'PENDING' },
    // activeUtr cleared → a genuine UTR rejected by mistake can be submitted again
    { $set: { status: 'REJECTED', activeUtr: null, reviewedBy: adminId, reviewedAt: new Date(), adminNote: String(note).trim() } },
    { new: true }
  );
  if (!reqDoc) throw new TopupError('Request not found or already reviewed', 'ALREADY_REVIEWED', 409);
  return reqDoc;
};
