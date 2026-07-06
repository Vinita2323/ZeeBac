import Referral from '../models/Referral.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// Get current user's referral stats and history
export const getMyReferrals = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch all referrals made by this user
    const referrals = await Referral.find({ referrerId: userId }).sort({ createdAt: -1 });
    
    // Calculate stats
    const totalInvited = referrals.length;
    const totalEarned = referrals
      .filter(r => r.rewardStatus === 'Credited')
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0);
    
    const user = await User.findById(userId);
    const referralCode = user?.referralCode || '';

    res.status(200).json({
      success: true,
      data: {
        referralCode,
        stats: {
          totalInvited,
          totalEarned
        },
        history: referrals
      }
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
