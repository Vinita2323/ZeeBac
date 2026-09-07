import Referral from '../models/Referral.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { creditWallet } from './wallet.util.js';

// Awards the referrer's bonus on a customer's first APPROVED transaction.
// Must be called inside the same session as the transaction that just made
// the count go to 1, so the count read sees that transaction consistently.
//
// The referral is atomically flipped from 'Signed Up' to 'Converted' as part
// of the same findOneAndUpdate that decides whether to pay out — two
// concurrent "first transactions" for the same customer can no longer both
// pass a stale read and both trigger a payout.
//
// Does NOT send the notification itself — `withTransaction` may re-run this
// callback on a transient error, and a push notification is not something
// that should ever fire twice. Callers send the notification only after the
// transaction has actually committed, using the returned info.
export const claimFirstPurchaseReferralBonus = async ({ session, customer }) => {
  if (!customer.referredBy) return null;

  const txnCount = await Transaction.countDocuments({ customerId: customer._id }).session(session);
  if (txnCount !== 1) return null;

  const referral = await Referral.findOneAndUpdate(
    { referredUserId: customer._id, status: 'Signed Up' },
    { status: 'Converted', rewardStatus: 'Credited', rewardCreditedAt: new Date() },
    { session }
  );
  if (!referral) return null;

  const rewardAmount = referral.rewardAmount || 150;
  const referrer = await User.findById(referral.referrerId).select('zeebacId fcmTokens name').session(session);
  if (!referrer) return null;

  await creditWallet({
    session,
    ownerId: referrer._id,
    ownerType: 'User',
    ownerZeebacId: referrer.zeebacId,
    amount: rewardAmount,
    category: 'referral_bonus',
    description: `Referral bonus for inviting ${customer.name}`,
    referenceId: referral._id,
    referenceType: 'Referral',
  });

  return {
    referralId: referral._id,
    referrerId: referrer._id,
    referrerFcmTokens: referrer.fcmTokens || [],
    rewardAmount,
    customerName: customer.name,
  };
};
