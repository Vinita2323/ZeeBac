import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import logger from '../utils/logger.js';

// ─── Dashboard Stats ───
export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalVendors = await Vendor.countDocuments();
    const pendingVendors = await Vendor.countDocuments({ status: 'Pending' });

    // Mocking total revenue and transactions for now until Phase 3 is implemented
    const totalTransactions = 0;
    const totalRevenue = 0;

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalVendors,
        pendingVendors,
        totalTransactions,
        totalRevenue,
      },
    });
  } catch (error) {
    logger.error(`Error in getDashboardStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Vendor Management ───
export const getAllVendors = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (status) {
      query.status = status;
    }

    const vendors = await Vendor.find(query)
      .select('-refreshToken') // Don't send sensitive tokens
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      data: vendors,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error in getAllVendors: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id).select('-refreshToken');
    
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    logger.error(`Error in getVendorById: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const approveVendor = async (req, res) => {
  try {
    const { id } = req.params;
    let { cashbackRate } = req.body;

    if (!cashbackRate) {
      cashbackRate = 5; // Default 5%
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    vendor.status = 'Verified';
    vendor.cashbackRate = cashbackRate;
    vendor.verifiedAt = new Date();
    vendor.verifiedBy = req.user._id; // from auth middleware

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor approved successfully',
      data: vendor,
    });
  } catch (error) {
    logger.error(`Error in approveVendor: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const rejectVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    vendor.status = 'Rejected';
    vendor.rejectionReason = reason;

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor rejected',
      data: vendor,
    });
  } catch (error) {
    logger.error(`Error in rejectVendor: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── User Management ───
export const getAllUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query)
      .select('-refreshToken')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error in getAllUsers: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.status = 'Suspended';
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User suspended successfully',
      data: user,
    });
  } catch (error) {
    logger.error(`Error in suspendUser: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const unsuspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.status = 'Active';
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User unsuspended successfully',
      data: user,
    });
  } catch (error) {
    logger.error(`Error in unsuspendUser: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
