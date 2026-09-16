import Referral from '../models/Referral.js';
import User from '../models/User.js';
import RewardConfig from '../models/RewardConfig.js';
import logger from '../utils/logger.js';

// Get current user's referral stats and history
export const getMyReferrals = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Auto-generate referral code if missing
    let referralCode = user.referralCode;
    if (!referralCode) {
      const cleanName = (user.name || 'ZEE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'ZEE';
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      referralCode = `${cleanName}${randomSuffix}`;

      // Ensure uniqueness
      const existing = await User.findOne({ referralCode });
      if (existing) {
        referralCode = `${cleanName}${Date.now().toString().slice(-4)}`;
      }

      user.referralCode = referralCode;
      await user.save();
    }

    // Fetch dynamic reward amount from Admin RewardConfig
    const config = await RewardConfig.findOne();
    const activeRewardAmount = config?.referralReward || 150;

    // Fetch all referrals made by this user
    const referrals = await Referral.find({ referrerId: userId })
      .populate('referredUserId', 'name phone profileImage')
      .sort({ createdAt: -1 });

    // Calculate stats
    const totalInvited = referrals.length;
    const totalEarned = referrals
      .filter((r) => r.rewardStatus === 'Credited')
      .reduce((sum, r) => sum + (r.rewardAmount || activeRewardAmount), 0);

    // Format referral history with masked phone for privacy
    const history = referrals.map((r) => {
      const friendName = r.referredUserId?.name || r.referrerName || 'Friend';
      const rawPhone = r.referredUserId?.phone || r.referredPhone || '';
      const maskedPhone = rawPhone.length >= 10
        ? `${rawPhone.slice(0, 3)}****${rawPhone.slice(-3)}`
        : rawPhone;

      return {
        _id: r._id,
        friendName,
        friendPhone: maskedPhone,
        status: r.status, // 'Signed Up' | 'Converted'
        rewardStatus: r.rewardStatus, // 'Pending' | 'Credited'
        rewardAmount: r.rewardAmount || activeRewardAmount,
        createdAt: r.createdAt,
        rewardCreditedAt: r.rewardCreditedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        referralCode,
        rewardAmount: activeRewardAmount,
        stats: {
          totalInvited,
          totalEarned,
        },
        history,
      },
    });
  } catch (error) {
    logger.error(`Error in getMyReferrals: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch referral data' });
  }
};

// Admin: Get overall referral program statistics
export const getReferralStats = async (req, res) => {
  try {
    // Total Referrals
    const totalReferrals = await Referral.countDocuments();
    
    // Total Payouts
    const payouts = await Referral.aggregate([
      { $match: { rewardStatus: 'Credited' } },
      { $group: { _id: null, total: { $sum: '$rewardAmount' } } }
    ]);
    const totalPayouts = payouts.length > 0 ? payouts[0].total : 0;
    
    // Conversion Rate
    const convertedReferrals = await Referral.countDocuments({ status: 'Converted' });
    const conversionRate = totalReferrals > 0 
      ? ((convertedReferrals / totalReferrals) * 100).toFixed(1)
      : 0;

    // Top Referrers
    const topReferrersRaw = await Referral.aggregate([
      { $match: { status: 'Converted' } },
      { $group: { 
          _id: '$referrerId', 
          invites: { $sum: 1 }, 
          earned: { $sum: '$rewardAmount' },
          name: { $first: '$referrerName' }
        } 
      },
      { $sort: { invites: -1 } },
      { $limit: 10 }
    ]);
    
    // Formatting for frontend
    const topReferrers = topReferrersRaw.map(r => ({
      id: r._id,
      name: r.name || 'Unknown User',
      invites: r.invites,
      earned: `₹${r.earned}`,
      status: 'Active'
    }));

    res.status(200).json({
      success: true,
      data: {
        totalReferrals,
        totalPayouts: `₹${totalPayouts.toLocaleString('en-IN')}`,
        conversionRate: `${conversionRate}%`,
        topReferrers
      }
    });
  } catch (error) {
    logger.error(`Error in getReferralStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch referral stats' });
  }
};
