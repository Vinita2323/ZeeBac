import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Transaction from '../models/Transaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import CashbackRequest from '../models/CashbackRequest.js';
import Referral from '../models/Referral.js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notification.service.js';
import { notifyAdmins } from '../utils/adminNotification.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// Helper to get or create wallet
const getOrCreateWallet = async (ownerId, ownerType, zeebacId) => {
  let wallet = await Wallet.findOne({ ownerId, ownerType });
  if (!wallet) {
    wallet = await Wallet.create({ ownerId, ownerType, ownerZeebacId: zeebacId });
  }
  return wallet;
};

// ─── Get Vendor Profile ───
export const getProfile = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id).select('-refreshToken');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    logger.error(`Error in vendor getProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Update Vendor Profile ───
export const updateProfile = async (req, res) => {
  try {
    const { 
      description, 
      socialLinks, 
      bankDetails,
      address,
      operatingHours,
      profilePic
    } = req.body;

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (description !== undefined) vendor.description = description;
    if (operatingHours !== undefined) vendor.operatingHours = operatingHours;
    if (profilePic !== undefined) vendor.profilePic = profilePic;
    
    if (socialLinks) {
      vendor.socialLinks = { ...vendor.socialLinks, ...socialLinks };
    }
    
    // Only allow updating safe bank details, not everything directly
    if (bankDetails) {
      if (!vendor.bankDetails) vendor.bankDetails = {};
      if (bankDetails.upiId !== undefined) vendor.bankDetails.upiId = bankDetails.upiId;
    }

    if (address && typeof address === 'object') {
      if (!vendor.address) vendor.address = {};
      for (const key in address) {
        vendor.address[key] = address[key];
      }
    }

    // Fix GeoJSON 2dsphere index error for existing bad data
    if (vendor.location && (!vendor.location.coordinates || vendor.location.coordinates.length === 0)) {
      vendor.location = undefined;
    }

    await vendor.save();
    
    logger.info(`[vendor.controller] Profile updated successfully for vendor ID: ${vendor._id}`);

    res.status(200).json({ success: true, message: 'Profile updated successfully', data: vendor });
  } catch (error) {
    logger.error(`Error in vendor updateProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Dashboard Stats (Phase 3D Real Data) ───
export const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Aggregate transactions for this vendor
    const stats = await Transaction.aggregate([
      { $match: { vendorId: vendor._id, status: 'Approved' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalCashbackGiven: { $sum: "$cashbackAmount" },
          totalTransactions: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerId" }
        }
      }
    ]);

    const result = stats[0] || { totalRevenue: 0, totalCashbackGiven: 0, totalTransactions: 0, uniqueCustomers: [] };
    const totalCustomersCount = result.uniqueCustomers.length;

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: result.totalRevenue,
        totalCustomers: totalCustomersCount,
        totalTransactions: result.totalTransactions,
        avgRating: vendor.stats.avgRating || 0,
        totalCashbackGiven: result.totalCashbackGiven
      }
    });
  } catch (error) {
    logger.error(`Error in vendor getDashboardStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Vendor Customers List (Phase 3D) ───
export const getVendorCustomers = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const mongoose = (await import('mongoose')).default;
    
    // Find all customers who have transacted with this vendor
    const customersAggr = await Transaction.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
      {
        $group: {
          _id: "$customerId",
          totalSpent: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          lastTransactionDate: { $max: "$createdAt" },
          customerName: { $first: "$customerName" },
          customerPhone: { $first: "$customerPhone" },
          customerZeebacId: { $first: "$customerZeebacId" }
        }
      },
      { $sort: { lastTransactionDate: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: customersAggr
    });
  } catch (error) {
    logger.error(`Error in getVendorCustomers: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Request Withdrawal (Phase 3D) ───
export const requestWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const wallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);

    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal' });
    }

    // Deduct from balance
    wallet.balance -= amount;
    // Add to pending withdrawal tracking if schema supports it, else we just deduct.
    // Let's create the withdrawal request record
    const withdrawalReq = await WithdrawalRequest.create({
      vendorId: vendor._id,
      amount,
      status: 'Pending',
      bankDetailsSnapshot: vendor.bankDetails || {}
    });

    // Create a ledger entry for the withdrawal deduction
    await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: vendor._id,
      ownerType: 'Vendor',
      type: 'debit',
      category: 'withdrawal',
      amount: amount,
      balanceAfter: wallet.balance,
      referenceId: withdrawalReq._id,
      referenceType: 'WithdrawalRequest',
      description: `Withdrawal request initiated`,
      vendorName: vendor.storeName
    });

    await wallet.save();

    await notifyAdmins('PAYOUT_REQUEST', 'New Payout Request', `Vendor "${vendor.storeName}" requested a withdrawal of ₹${amount}.`);

    res.status(201).json({ success: true, message: 'Withdrawal request submitted successfully', data: withdrawalReq });
  } catch (error) {
    logger.error(`Error in requestWithdrawal: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Products (Phase 3B) ───

// Get all products for the vendor
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find({ vendorId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    logger.error(`Error in vendor getProducts: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Create a new product
export const createProduct = async (req, res) => {
  try {
    const { 
      name, price, discountPrice, category, sku, description, isHighlight, stock, isActive,
      isBranded, brandName, brandCompany, brandWebsite, brandDescription, 
      brandEmail, brandContact, cashbackPercentage 
    } = req.body;

    const vendorId = req.user.id;
    
    // File URLs from multer
    let imageUrl = null;
    let brandLogoUrl = null;

    if (req.files) {
      if (req.files['image'] && req.files['image'][0]) {
        imageUrl = `/uploads/storefront/${req.files['image'][0].filename}`;
      }
      if (req.files['brandLogo'] && req.files['brandLogo'][0]) {
        brandLogoUrl = `/uploads/storefront/${req.files['brandLogo'][0].filename}`;
      }
    }

    const branding = {
      isBranded: isBranded === 'true',
      brandName,
      brandCompany,
      brandWebsite,
      brandDescription,
      brandEmail,
      brandContact,
      brandLogo: brandLogoUrl,
      cashbackPercentage: cashbackPercentage ? Number(cashbackPercentage) : undefined
    };

    const newProduct = new Product({
      vendorId,
      name,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : undefined,
      category: category || 'Bestsellers',
      sku,
      description,
      image: imageUrl,
      isHighlight: isHighlight === 'true',
      isActive: isActive !== 'false', // Default true unless explicitly false
      stock: stock ? Number(stock) : 0,
      branding
    });

    await newProduct.save();
    
    logger.info(`[vendor.controller] Product created: ${newProduct._id} by Vendor: ${vendorId}`);
    res.status(201).json({ success: true, message: 'Product created successfully', data: newProduct });
  } catch (error) {
    logger.error(`Error in vendor createProduct: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update a product
export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const vendorId = req.user.id;
    
    const product = await Product.findOne({ _id: productId, vendorId });
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Usually we do a partial update. Just copying the body fields.
    const updates = req.body;
    
    // Handle specific boolean fields from form data if necessary
    if (updates.isHighlight !== undefined) product.isHighlight = updates.isHighlight === 'true' || updates.isHighlight === true;
    if (updates.isActive !== undefined) product.isActive = updates.isActive === 'true' || updates.isActive === true;
    if (updates.price !== undefined) product.price = Number(updates.price);
    if (updates.discountPrice !== undefined) product.discountPrice = Number(updates.discountPrice);
    if (updates.stock !== undefined) product.stock = Number(updates.stock);
    
    // Generic strings
    ['name', 'category', 'sku', 'description'].forEach(key => {
      if (updates[key] !== undefined) product[key] = updates[key];
    });

    await product.save();
    
    logger.info(`[vendor.controller] Product updated: ${product._id} by Vendor: ${vendorId}`);
    res.status(200).json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    logger.error(`Error in vendor updateProduct: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a product
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const vendorId = req.user.id;
    
    const product = await Product.findOneAndDelete({ _id: productId, vendorId });
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    logger.info(`[vendor.controller] Product deleted: ${productId} by Vendor: ${vendorId}`);
    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    logger.error(`Error in vendor deleteProduct: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Phase 3C: Transaction Engine ───

// 1. Lookup Customer by Phone or ZeeBac ID
export const lookupCustomerByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    console.log(`\n===========================================`);
    console.log(`[lookupCustomerByPhone] HIT! Raw param: "${phone}"`);
    
    // Ensure we are working with string and trimming it just in case
    const cleanPhone = phone ? String(phone).trim() : '';
    console.log(`[lookupCustomerByPhone] Clean param to search: "${cleanPhone}"`);

    const user = await User.findOne({ 
      $or: [
        { phone: cleanPhone },
        { zeebacId: cleanPhone.toUpperCase() }
      ]
    }).select('name zeebacId phone role status');

    if (!user) {
      console.log(`[lookupCustomerByPhone] ❌ Customer NOT FOUND for input: "${cleanPhone}"`);
      console.log(`===========================================\n`);
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    console.log(`[lookupCustomerByPhone] ✅ Customer FOUND: ${user.name} (${user.zeebacId})`);
    console.log(`===========================================\n`);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error(`Error in lookupCustomerByPhone: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 2. Log Purchase (QR/Manual)
export const logPurchase = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { customerPhone, amount } = req.body;

    if (!customerPhone || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid input data' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const customer = await User.findOne({ phone: customerPhone });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Calculate Cashback
    const cashbackRate = vendor.cashbackRate || 10;
    const cashbackAmount = (amount * cashbackRate) / 100;

    // Get Wallets
    const vendorWallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);
    const customerWallet = await getOrCreateWallet(customer._id, 'User', customer.zeebacId);

    // Check Vendor Balance
    if (vendorWallet.balance < cashbackAmount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Insufficient wallet balance for cashback. Please recharge your wallet.' 
      });
    }

    // 1. Deduct from Vendor
    vendorWallet.balance -= cashbackAmount;
    vendorWallet.totalWithdrawn += cashbackAmount;
    await vendorWallet.save();

    // 2. Credit to Customer
    customerWallet.balance += cashbackAmount;
    customerWallet.totalEarned += cashbackAmount;
    await customerWallet.save();

    // 3. Create Transaction Record
    const transactionId = `TX-${Math.floor(1000 + Math.random() * 9000)}`;
    const tx = await Transaction.create({
      transactionId,
      customerId: customer._id,
      customerZeebacId: customer.zeebacId,
      customerPhone: customer.phone,
      customerName: customer.name,
      vendorId: vendor._id,
      vendorZeebacId: vendor.zeebacId,
      vendorName: vendor.storeName,
      vendorPhone: vendor.phone,
      vendorCategory: vendor.category,
      type: 'manual',
      initiatedBy: 'vendor',
      amount,
      cashbackPercent: cashbackRate,
      cashbackAmount,
      status: 'Approved', // Auto-approved since vendor initiated
      source: 'vendor_manual',
    });

    // 4. Create Ledger Entries (WalletTransactions)
    // Vendor Debit
    await WalletTransaction.create({
      walletId: vendorWallet._id,
      ownerId: vendor._id,
      ownerType: 'Vendor',
      type: 'debit',
      category: 'cashback',
      amount: cashbackAmount,
      balanceAfter: vendorWallet.balance,
      referenceId: tx._id,
      referenceType: 'Transaction',
      description: `Cashback given to ${customer.name}`,
      vendorName: vendor.storeName
    });

    // Customer Credit
    await WalletTransaction.create({
      walletId: customerWallet._id,
      ownerId: customer._id,
      ownerType: 'User',
      type: 'credit',
      category: 'cashback',
      amount: cashbackAmount,
      balanceAfter: customerWallet.balance,
      referenceId: tx._id,
      referenceType: 'Transaction',
      description: `Cashback from ${vendor.storeName}`,
      vendorName: vendor.storeName
    });

    // 5. Referral Logic: Check if this is customer's first transaction
    if (customer.referredBy) {
      const txnCount = await Transaction.countDocuments({ customerId: customer._id });
      if (txnCount === 1) {
        // First transaction, reward the referrer
        const referral = await Referral.findOne({ referredUserId: customer._id, status: 'Signed Up' });
        if (referral) {
          const rewardAmount = referral.rewardAmount || 150;

          // Find referrer's wallet
          let referrerWallet = await Wallet.findOne({ ownerId: referral.referrerId, ownerType: 'User' });
          if (!referrerWallet) {
            referrerWallet = await Wallet.create({ ownerId: referral.referrerId, ownerType: 'User' });
          }

          // Credit referrer
          const refPrevBalance = referrerWallet.balance || 0;
          const refNewBalance = refPrevBalance + rewardAmount;
          await Wallet.findByIdAndUpdate(referrerWallet._id, { balance: refNewBalance });

          // Create ledger entry
          await WalletTransaction.create({
            walletId: referrerWallet._id,
            ownerId: referral.referrerId,
            ownerType: 'User',
            type: 'credit',
            category: 'referral_bonus',
            amount: rewardAmount,
            balanceAfter: refNewBalance,
            referenceId: referral._id,
            referenceType: 'Referral',
            description: `Referral bonus for inviting ${customer.name}`,
          });

          // Update Referral doc
          referral.status = 'Converted';
          referral.rewardStatus = 'Credited';
          referral.rewardCreditedAt = new Date();
          await referral.save();

          // 🔔 Notify referrer about bonus
          const referrerUser = await User.findById(referral.referrerId).select('fcmTokens');
          sendNotification({
            recipientId: referral.referrerId,
            recipientType: 'customer',
            fcmTokens: referrerUser?.fcmTokens || [],
            type: 'referral',
            title: '🎊 Referral Bonus Credited!',
            message: `₹${rewardAmount} has been added to your wallet because ${customer.name} made their first purchase using your referral!`,
            icon: 'group_add',
            referenceId: referral._id,
            referenceType: 'Referral',
          });

          logger.info(`[Referral] Awarded ₹${rewardAmount} to user ${referral.referrerId} for referring ${customer._id} (Vendor Initiated)`);
        }
      }
    }

    logger.info(`[vendor.controller] Purchase logged: ${tx.transactionId} by Vendor: ${vendor.storeName} for Customer: ${customer.name}`);
    res.status(201).json({ success: true, message: 'Purchase logged and cashback sent successfully', data: tx });

  } catch (error) {
    logger.error(`Error in logPurchase: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 3. Get Vendor Transactions
export const getVendorTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    logger.error(`Error in getVendorTransactions: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 4. Get Vendor Wallet
export const getVendorWallet = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id);
    const wallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);
    
    // Get recent ledger
    const ledger = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .limit(30);

    res.status(200).json({ success: true, data: { wallet, ledger } });
  } catch (error) {
    logger.error(`Error in getVendorWallet: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// 5. Create Razorpay Order for Wallet Recharge
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const rechargeAmount = Number(amount);

    if (!rechargeAmount || rechargeAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: rechargeAmount * 100, // Razorpay amount is in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };

    const order = await instance.orders.create(options);

    res.status(200).json({ success: true, order });
  } catch (error) {
    logger.error(`Error in createRazorpayOrder: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
};

// 6. Verify Razorpay Payment and Add Funds
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Payment is valid, add funds to wallet
    const vendor = await Vendor.findById(req.user.id);
    const wallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);
    
    wallet.balance += Number(amount);
    await wallet.save();

    await WalletTransaction.create({
      walletId: wallet._id,
      ownerId: vendor._id,
      ownerType: 'Vendor',
      type: 'credit',
      category: 'settlement',
      amount: Number(amount),
      balanceAfter: wallet.balance,
      description: 'Wallet Recharge via Razorpay',
      referenceType: 'Transaction', // Keeps reference validation happy, or you can omit if referenceId is null
      gatewayName: 'Razorpay',
      gatewayOrderId: razorpay_order_id,
      gatewayPaymentId: razorpay_payment_id,
      vendorName: vendor.storeName
    });

    res.status(200).json({ success: true, message: 'Payment successful, wallet recharged!', data: { balance: wallet.balance } });

  } catch (error) {
    logger.error(`Error in verifyRazorpayPayment: ${error.message}`);
    res.status(500).json({ success: false, message: 'Verification Failed', error: error.message });
  }
};

// ─── Phase 4E: Cashback Requests Approvals ───

export const getPendingRequests = async (req, res) => {
  try {
    const requests = await CashbackRequest.find({
      vendorId: req.user.id,
      status: 'Pending'
    }).populate('customerId', 'name phone').sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    logger.error(`getPendingRequests error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const respondToCashbackRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'Approve' or 'Reject'

    const request = await CashbackRequest.findOne({ _id: id, vendorId: req.user.id }).populate('customerId');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'Pending') return res.status(400).json({ success: false, message: 'Already processed' });

    if (action === 'Reject') {
      request.status = 'Rejected';
      await request.save();
      return res.status(200).json({ success: true, message: 'Request rejected' });
    }

    if (action === 'Approve') {
      const vendor = await Vendor.findById(req.user.id);
      const customer = request.customerId;

      // Calculate cashback
      const amount = request.amount;
      const cashbackAmount = Math.round(amount * (vendor.cashbackRate / 100) * 100) / 100;

      // Ensure vendor has enough balance
      let vendorWallet = await getOrCreateWallet(vendor._id, 'Vendor', vendor.zeebacId);
      if ((vendorWallet.balance || 0) < cashbackAmount) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance for cashback' });
      }

      // 1. Create Transaction
      const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const txn = await Transaction.create({
        transactionId, customerId: customer._id, customerZeebacId: customer.zeebacId,
        customerPhone: customer.phone, customerName: customer.name,
        vendorId: vendor._id, vendorZeebacId: vendor.zeebacId,
        vendorName: vendor.storeName, vendorPhone: vendor.phone,
        vendorCategory: vendor.category, type: 'receipt_claim',
        initiatedBy: 'customer', source: 'customer_request',
        amount: parseFloat(amount), cashbackPercent: vendor.cashbackRate,
        cashbackAmount, paymentMethod: 'Other', status: 'Approved',
        hasReceipt: true, receiptUrl: request.billImageUrl
      });

      // 2. Debit Vendor Wallet
      const vPrevBalance = vendorWallet.balance || 0;
      const vNewBalance = vPrevBalance - cashbackAmount;
      await Wallet.findByIdAndUpdate(vendorWallet._id, { balance: vNewBalance });
      await WalletTransaction.create({
        walletId: vendorWallet._id, ownerId: vendor._id, ownerType: 'Vendor',
        type: 'debit', category: 'cashback', amount: cashbackAmount, balanceAfter: vNewBalance,
        referenceId: txn._id, referenceType: 'Transaction',
        description: `Approved Cashback for ${customer.name}`
      });

      // 3. Credit Customer Wallet
      let customerWallet = await getOrCreateWallet(customer._id, 'User', customer.zeebacId);
      const cNewBalance = (customerWallet.balance || 0) + cashbackAmount;
      await Wallet.findByIdAndUpdate(customerWallet._id, { balance: cNewBalance });
      await WalletTransaction.create({
        walletId: customerWallet._id, ownerId: customer._id, ownerType: 'User',
        type: 'credit', category: 'cashback', amount: cashbackAmount, balanceAfter: cNewBalance,
        referenceId: txn._id, referenceType: 'Transaction',
        description: `Cashback approved from ${vendor.storeName}`
      });

      // 4. Update stats and request status
      await Vendor.findByIdAndUpdate(vendor._id, { $inc: { 'stats.totalRevenue': parseFloat(amount) } });
      request.status = 'Approved';
      await request.save();

      // 🔔 Notify customer that cashback request approved
      sendNotification({
        recipientId: customer._id,
        recipientType: 'customer',
        fcmTokens: customer.fcmTokens || [],
        type: 'credit',
        title: '✅ Cashback Request Approved!',
        message: `₹${cashbackAmount} cashback from ${vendor.storeName} has been approved. Wallet balance updated!`,
        icon: 'check_circle',
        referenceId: txn._id,
        referenceType: 'Transaction',
      });

      return res.status(200).json({ success: true, message: 'Request approved successfully' });
    }

    res.status(400).json({ success: false, message: 'Invalid action' });
  } catch (error) {
    logger.error(`respondToCashbackRequest error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};


