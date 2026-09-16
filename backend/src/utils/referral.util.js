import Referral from '../models/Referral.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import RewardConfig from '../models/RewardConfig.js';
import Transaction from '../models/Transaction.js';
import { creditWallet, debitWallet } from './wallet.util.js';
import logger from './logger.js';

// Awards the referrer's bonus on a customer's first APPROVED transaction.
// Must be called inside the same session as the transaction that just made
// the count go to 1, so the count read sees that transaction consistently.
//
// The referral amount is strictly debited from the Admin Platform Wallet
// and credited to the Referrer User Wallet, maintaining a balanced double-entry ledger.
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

  // Determine dynamic reward amount from RewardConfig (fallback to 150)
  const config = await RewardConfig.findOne().session(session);
  const rewardAmount = referral.rewardAmount || config?.referralReward || 150;

  const referrer = await User.findById(referral.referrerId).select('zeebacId fcmTokens name').session(session);
  if (!referrer) return null;

  // 1. Debit Admin Platform Wallet
  const adminUser = await AdminUser.findOne({ role: { $in: ['super_admin', 'admin'] } }).session(session);
  if (adminUser) {
    try {
      await debitWallet({
        session,
        ownerId: adminUser._id,
        ownerType: 'Admin',
        amount: rewardAmount,
        category: 'referral_bonus',
        description: `Referral bonus payout to ${referrer.name || 'User'} for inviting ${customer.name || 'Customer'}`,
        referenceId: referral._id,
        referenceType: 'Referral',
      });
      logger.info(`[Referral Payout] Debited ₹${rewardAmount} from Admin Wallet (${adminUser.email})`);
    } catch (err) {
      logger.error(`[Referral Payout] Failed to debit admin wallet: ${err.message}`);
      throw err; // Abort transaction if admin wallet fails
    }
  } else {
    logger.warn(`[Referral Payout] No active AdminUser found for wallet debit!`);
  }

  // 2. Credit Referrer User Wallet
  await creditWallet({
    session,
    ownerId: referrer._id,
    ownerType: 'User',
    ownerZeebacId: referrer.zeebacId,
    amount: rewardAmount,
    category: 'referral_bonus',
    description: `Referral bonus for inviting ${customer.name || 'Customer'}`,
    referenceId: referral._id,
    referenceType: 'Referral',
  });

  logger.info(`[Referral Payout] Credited ₹${rewardAmount} to Referrer (${referrer.name || referrer._id})`);

  return {
    referralId: referral._id,
    referrerId: referrer._id,
    referrerFcmTokens: referrer.fcmTokens || [],
    rewardAmount,
    customerName: customer.name,
  };
};
