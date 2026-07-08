import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import CashbackRule from '../models/CashbackRule.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
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
    const { status, search, page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { storeName: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } }
      ];
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

// ─── Cashback Rules CRUD ───

export const getCashbackRules = async (req, res) => {
  try {
    const rules = await CashbackRule.find().sort({ priority: -1, createdAt: -1 });
    res.status(200).json({ success: true, data: rules });
  } catch (error) {
    logger.error(`Error in getCashbackRules: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const createCashbackRule = async (req, res) => {
  try {
    const { shopType, minCashback, maxCashback, priority } = req.body;
    const rule = await CashbackRule.create({
      shopType, minCashback, maxCashback, priority,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: rule, message: 'Rule created' });
  } catch (error) {
    logger.error(`Error in createCashbackRule: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const updateCashbackRule = async (req, res) => {
  try {
    const rule = await CashbackRule.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    res.status(200).json({ success: true, data: rule, message: 'Rule updated' });
  } catch (error) {
    logger.error(`Error in updateCashbackRule: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const deleteCashbackRule = async (req, res) => {
  try {
    const rule = await CashbackRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
    res.status(200).json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    logger.error(`Error in deleteCashbackRule: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Transactions (Phase B) ───
export const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '', sortBy = 'newest' } = req.query;

    let query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { vendorName:   { $regex: search, $options: 'i' } },
        { transactionId: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 }; // newest by default
    if (sortBy === 'amount_high') {
      sortOption = { amount: -1 };
    } else if (sortBy === 'amount_low') {
      sortOption = { amount: 1 };
    }

    const transactions = await Transaction.find(query)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: transactions,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Error in getAllTransactions: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Analytics (Phase C) ───

export const getRevenueAnalytics = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const transactions = await Transaction.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        totalAmount: { $sum: "$amount" }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Fill missing days with 0
    const labels = [];
    const amounts = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const dateString = d.toISOString().split('T')[0];
      const dayName = days[d.getDay()];
      
      const found = transactions.find(t => t._id === dateString);
      labels.push(dayName);
      amounts.push(found ? found.totalAmount : 0);
    }

    res.status(200).json({ success: true, data: { labels, amounts } });
  } catch (error) {
    logger.error(`Error in getRevenueAnalytics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getUserAnalytics = async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const users = await User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Fill missing months
    const labels = [];
    const counts = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(d.getMonth() + i);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = monthNames[d.getMonth()];
      
      const found = users.find(u => u._id === monthStr);
      labels.push(monthName);
      counts.push(found ? found.count : 0);
    }

    res.status(200).json({ success: true, data: { labels, counts } });
  } catch (error) {
    logger.error(`Error in getUserAnalytics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getTopVendors = async (req, res) => {
  try {
    const topVendors = await Transaction.aggregate([
      { $group: {
        _id: "$vendorId",
        vendorName: { $first: "$vendorName" },
        totalAmount: { $sum: "$amount" },
        txnCount: { $sum: 1 }
      }},
      { $sort: { totalAmount: -1 } },
      { $limit: 5 }
    ]);

    res.status(200).json({ success: true, data: topVendors });
  } catch (error) {
    logger.error(`Error in getTopVendors: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getVendorCategoryBreakdown = async (req, res) => {
  try {
    const categories = await Vendor.aggregate([
      { $group: {
        _id: "$category",
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ]);
    
    const totalVendors = await Vendor.countDocuments();
    
    const formatted = categories.map(cat => ({
      name: cat._id || 'Uncategorized',
      count: cat.count,
      percentage: totalVendors ? Math.round((cat.count / totalVendors) * 100) : 0
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    logger.error(`Error in getVendorCategoryBreakdown: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Wallet Monitor (Phase E) ───

export const getWalletStats = async (req, res) => {
  try {
    const floatResult = await Wallet.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]);
    const totalFloat = floatResult[0]?.total || 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const creditsResult = await WalletTransaction.aggregate([
      { $match: { type: 'credit', timestamp: { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const todaysCredits = creditsResult[0]?.total || 0;

    const debitsResult = await WalletTransaction.aggregate([
      { $match: { type: 'debit', timestamp: { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const todaysDebits = debitsResult[0]?.total || 0;

    const pendingPayouts = 0; // Mocked for now

    res.status(200).json({
      success: true,
      data: { totalFloat, todaysCredits, todaysDebits, pendingPayouts }
    });
  } catch (error) {
    logger.error(`Error in getWalletStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getAllWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'All', search = '', sortBy = 'newest' } = req.query;

    let query = {};
    if (type !== 'All') {
      query.type = type.toLowerCase();
    }

    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } }
      ];
    }

    let sortOption = { timestamp: -1 };
    if (sortBy === 'amount_high') sortOption = { amount: -1 };
    if (sortBy === 'amount_low') sortOption = { amount: 1 };

    const txns = await WalletTransaction.find(query)
      .populate('ownerId', 'name storeName')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await WalletTransaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: txns,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error in getAllWalletTransactions: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Fraud Detection (Phase F) ───

export const getFraudAlerts = async (req, res) => {
  try {
    // 1. Flagged Accounts (Suspended or Banned Users)
    const flaggedUsers = await User.find({ status: { $in: ['Suspended', 'Banned'] } })
      .select('name zeebacId status')
      .limit(10);
    
    const flaggedAccounts = flaggedUsers.map(user => ({
      id: user.zeebacId || user._id.toString().substring(0, 8),
      name: user.name,
      type: 'Customer',
      flag: 'Account Suspended/Banned',
      status: user.status
    }));

    // 2. High Value Transactions (>= ₹50,000)
    const highValueTxns = await Transaction.find({ amount: { $gte: 50000 } })
      .populate('customerId', 'status')
      .populate('vendorId', 'status')
      .sort({ createdAt: -1 })
      .limit(20);

    const activeHighValueTxns = highValueTxns.filter(txn => {
      const uStatus = txn.customerId?.status || 'Active';
      const vStatus = txn.vendorId?.status || 'Active';
      return uStatus === 'Active' && vStatus === 'Active';
    }).slice(0, 5);

    const highValueAlerts = activeHighValueTxns.map(txn => ({
      id: txn._id.toString(),
      type: 'High Value',
      description: `Transaction of ₹${txn.amount.toLocaleString()}`,
      vendor: txn.vendorName,
      user: txn.customerName,
      time: new Date(txn.createdAt).toLocaleString(),
      risk: 'High'
    }));

    // 3. High Frequency Alerts (Vendor with > 10 txns in last 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const freqTxns = await Transaction.aggregate([
      { $match: { createdAt: { $gte: oneHourAgo } } },
      { $group: { _id: '$vendorId', vendorName: { $first: '$vendorName' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 10 } } }
    ]);

    const highFreqAlerts = freqTxns.map(ft => ({
      id: ft._id.toString(),
      type: 'High Volume',
      description: `${ft.count} transactions in the last hour`,
      vendor: ft.vendorName,
      time: 'Last 1 Hour',
      risk: 'Critical'
    }));

    const alerts = [...highValueAlerts, ...highFreqAlerts];
    
    let riskLevel = 'Low';
    if (alerts.length > 0 && alerts.length <= 2) riskLevel = 'Medium';
    else if (alerts.length > 2 && alerts.length <= 5) riskLevel = 'High';
    else if (alerts.length > 5) riskLevel = 'Critical';

    res.status(200).json({
      success: true,
      data: {
        alerts,
        flaggedAccounts,
        riskLevel
      }
    });
  } catch (error) {
    logger.error(`Error in getFraudAlerts: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
