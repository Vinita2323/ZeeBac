import mongoose from 'mongoose';
import Recharge from '../models/Recharge.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import logger from '../utils/logger.js';
import { debitWallet, InsufficientBalanceError } from '../utils/wallet.util.js';
import { sendNotification } from '../services/notification.service.js';

// Curated Telecom Plans Catalog
export const TELECOM_PLANS = {
  Jio: [
    { id: 'jio_19', amount: 19, category: 'Data Add-on', validity: 'Active Plan', data: '1.5 GB', talktime: 'NA', description: 'High-speed 4G/5G data pack. Valid till your existing base plan.' },
    { id: 'jio_29', amount: 29, category: 'Data Add-on', validity: 'Active Plan', data: '2.5 GB', talktime: 'NA', description: 'Extra high-speed 4G/5G data pack. Valid till base plan.' },
    { id: 'jio_199', amount: 199, category: 'Popular', validity: '18 Days', data: '1.5 GB/Day', talktime: 'Unlimited', description: 'Truly Unlimited Calls + 100 SMS/Day + JioTV & JioCinema.' },
    { id: 'jio_239', amount: 239, category: 'Popular', validity: '22 Days', data: '1.5 GB/Day', talktime: 'Unlimited', description: 'Unlimited Voice Calls, 100 SMS/day + Free Unlimited True 5G Data.' },
    { id: 'jio_299', amount: 299, category: 'Unlimited', validity: '28 Days', data: '2.0 GB/Day', talktime: 'Unlimited', description: 'Best Value: Truly Unlimited Calls + Unlimited 5G Data + 100 SMS/Day.' },
    { id: 'jio_349', amount: 349, category: 'Unlimited', validity: '28 Days', data: '2.5 GB/Day', talktime: 'Unlimited', description: 'Hero Plan: 2.5GB/Day + Unlimited True 5G + JioCloud Premium access.' },
    { id: 'jio_666', amount: 666, category: 'Popular', validity: '70 Days', data: '1.5 GB/Day', talktime: 'Unlimited', description: 'Long Term: Truly Unlimited Calls + 1.5GB/Day for 70 Days.' },
    { id: 'jio_10', amount: 10, category: 'Top-up', validity: 'Unlimited', data: 'NA', talktime: '₹7.47 Talktime', description: 'Standard Top-up voucher with ₹7.47 talktime value.' },
  ],
  Airtel: [
    { id: 'airtel_19', amount: 19, category: 'Data Add-on', validity: '1 Day', data: '1.0 GB', talktime: 'NA', description: 'Emergency high-speed data booster for 1 day.' },
    { id: 'airtel_65', amount: 65, category: 'Data Add-on', validity: 'Active Plan', data: '4.0 GB', talktime: 'NA', description: 'Bulk 4GB data pack valid till current base plan.' },
    { id: 'airtel_199', amount: 199, category: 'Popular', validity: '28 Days', data: '2.0 GB Total', talktime: 'Unlimited', description: 'Unlimited Calls + 100 SMS/day + Wynk Music.' },
    { id: 'airtel_299', amount: 299, category: 'Unlimited', validity: '28 Days', data: '1.5 GB/Day', talktime: 'Unlimited', description: 'Unlimited Voice, 100 SMS/day + Unlimited 5G Data access.' },
    { id: 'airtel_349', amount: 349, category: 'Unlimited', validity: '28 Days', data: '2.0 GB/Day', talktime: 'Unlimited', description: 'Best Seller: 2GB/Day + Unlimited 5G + Airtel Xstream Play.' },
    { id: 'airtel_549', amount: 549, category: 'Popular', validity: '28 Days', data: '3.0 GB/Day', talktime: 'Unlimited', description: 'Heavy Data: 3GB/Day + Unlimited 5G + Disney+ Hotstar Mobile 3 Months.' },
    { id: 'airtel_10', amount: 10, category: 'Top-up', validity: 'Unlimited', data: 'NA', talktime: '₹7.47 Talktime', description: 'Standard Top-up voucher with ₹7.47 talktime value.' },
  ],
  Vi: [
    { id: 'vi_19', amount: 19, category: 'Data Add-on', validity: '1 Day', data: '1.0 GB', talktime: 'NA', description: 'Instant 1GB high speed data for 24 hours.' },
    { id: 'vi_98', amount: 98, category: 'Data Add-on', validity: '21 Days', data: '9.0 GB', talktime: 'NA', description: '9GB high speed data valid for 21 days.' },
    { id: 'vi_199', amount: 199, category: 'Popular', validity: '18 Days', data: '1.0 GB/Day', talktime: 'Unlimited', description: 'Truly Unlimited Calling + 100 SMS/day.' },
    { id: 'vi_299', amount: 299, category: 'Unlimited', validity: '28 Days', data: '1.5 GB/Day', talktime: 'Unlimited', description: 'Hero Unlimited: 1.5GB/Day + Binge All Night (12am to 6am free data).' },
    { id: 'vi_359', amount: 359, category: 'Unlimited', validity: '28 Days', data: '3.0 GB/Day', talktime: 'Unlimited', description: 'Weekend Data Rollover + Binge All Night + 3GB/Day.' },
    { id: 'vi_10', amount: 10, category: 'Top-up', validity: 'Unlimited', data: 'NA', talktime: '₹7.47 Talktime', description: 'Standard Top-up voucher with ₹7.47 talktime balance.' },
  ],
  BSNL: [
    { id: 'bsnl_18', amount: 18, category: 'Popular', validity: '2 Days', data: '1.0 GB/Day', talktime: 'Unlimited', description: 'Unlimited Voice Calls + 1GB/Day high speed data.' },
    { id: 'bsnl_97', amount: 97, category: 'Popular', validity: '15 Days', data: '2.0 GB/Day', talktime: 'Unlimited', description: 'Unlimited Calls + 2GB/Day + Free Lokdhun content.' },
    { id: 'bsnl_187', amount: 187, category: 'Unlimited', validity: '28 Days', data: '1.5 GB/Day', talktime: 'Unlimited', description: 'Truly Unlimited Voice + 100 SMS/day + 1.5GB/Day.' },
    { id: 'bsnl_298', amount: 298, category: 'Unlimited', validity: '52 Days', data: '1.0 GB/Day', talktime: 'Unlimited', description: 'Long Term: Truly Unlimited Calls + 1GB/Day + EROS NOW entertainment.' },
    { id: 'bsnl_10', amount: 10, category: 'Top-up', validity: 'Unlimited', data: 'NA', talktime: '₹7.47 Talktime', description: 'Standard Top-up voucher with ₹7.47 talktime value.' },
  ],
};

// ─── 1. Get Recharge Plans ───
export const getRechargePlans = async (req, res) => {
  try {
    const { operator = 'Jio', circle = 'Delhi NCR' } = req.query;
    const normalizedOperator = Object.keys(TELECOM_PLANS).find(
      (op) => op.toLowerCase() === operator.toLowerCase()
    ) || 'Jio';

    const plans = TELECOM_PLANS[normalizedOperator] || [];

    res.status(200).json({
      success: true,
      operator: normalizedOperator,
      circle,
      data: plans,
    });
  } catch (error) {
    logger.error(`Error in getRechargePlans: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch recharge plans' });
  }
};

// ─── 2. Process Mobile Recharge from Wallet Balance ───
export const processMobileRecharge = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = req.user.id;
    const { mobileNumber, operator, circle = 'Delhi NCR', amount, planDetails } = req.body;

    // 1. Validation
    const cleanNumber = (mobileNumber || '').toString().trim().replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length !== 10 || !/^[6-9]\d{9}$/.test(cleanNumber)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)',
      });
    }

    const validOperators = ['Jio', 'Airtel', 'Vi', 'BSNL'];
    const matchedOperator = validOperators.find(
      (op) => op.toLowerCase() === (operator || '').toLowerCase()
    );
    if (!matchedOperator) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid operator. Must be one of: ${validOperators.join(', ')}`,
      });
    }

    const rechargeAmount = parseFloat(amount);
    if (!rechargeAmount || isNaN(rechargeAmount) || rechargeAmount < 1) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Recharge amount must be at least ₹1',
      });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 2. Check Wallet Balance
    const userWallet = await Wallet.findOne({
      ownerId: user._id,
      ownerType: { $in: ['User', 'user', 'customer', 'Customer'] },
    }).session(session);

    const currentBalance = userWallet?.balance || 0;
    if (currentBalance < rechargeAmount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance (Available: ₹${currentBalance.toFixed(2)}, Needed: ₹${rechargeAmount.toFixed(2)})`,
      });
    }

    // 3. Generate Authentic Operator Reference ID
    const timestamp = Date.now().toString().slice(-6);
    const randDigits = Math.floor(1000 + Math.random() * 9000);
    const operatorRefNumber = `RCH-${matchedOperator.toUpperCase()}-${timestamp}${randDigits}`;

    // 4. Create Temporary Recharge Document
    const rechargeDoc = new Recharge({
      userId: user._id,
      mobileNumber: cleanNumber,
      operator: matchedOperator,
      circle,
      amount: rechargeAmount,
      planDetails: planDetails || {
        planName: `${matchedOperator} ₹${rechargeAmount}`,
        description: `Mobile recharge for ${cleanNumber}`,
      },
      status: 'Success',
      operatorRefNumber,
    });

    // 5. Atomic Debit Wallet
    const updatedWallet = await debitWallet({
      session,
      ownerId: user._id,
      ownerType: 'User',
      amount: rechargeAmount,
      category: 'mobile_recharge',
      description: `Mobile Recharge - ${matchedOperator} (${cleanNumber})`,
      referenceId: rechargeDoc._id,
      referenceType: 'Recharge',
    });

    // 6. Link Wallet Transaction & Save Recharge
    rechargeDoc.walletTransactionId = updatedWallet._id;
    await rechargeDoc.save({ session });

    await session.commitTransaction();

    logger.info(
      `[processMobileRecharge] User ${user._id} recharged ${cleanNumber} (${matchedOperator}) for ₹${rechargeAmount}. Ref: ${operatorRefNumber}. New Balance: ₹${updatedWallet.balance}`
    );

    // 7. Send Real-time Notification
    try {
      await sendNotification({
        recipientId: user._id,
        recipientRole: 'customer',
        title: '📱 Mobile Recharge Successful!',
        message: `Recharge of ₹${rechargeAmount} for ${cleanNumber} (${matchedOperator}) completed. Ref: ${operatorRefNumber}`,
        type: 'WALLET_DEBIT',
        data: {
          rechargeId: rechargeDoc._id,
          operatorRefNumber,
          amount: rechargeAmount,
          mobileNumber: cleanNumber,
          newBalance: updatedWallet.balance,
        },
      });
    } catch (notifErr) {
      logger.warn(`Failed to dispatch recharge notification: ${notifErr.message}`);
    }

    res.status(200).json({
      success: true,
      message: `Mobile recharge of ₹${rechargeAmount} for ${cleanNumber} was successful!`,
      data: {
        recharge: rechargeDoc,
        newBalance: updatedWallet.balance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in processMobileRecharge: ${error.message}`);
    if (error instanceof InsufficientBalanceError) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }
    res.status(500).json({ success: false, message: error.message || 'Failed to process mobile recharge' });
  } finally {
    session.endSession();
  }
};

// ─── 3. Get User Recharge History ───
export const getMyRecharges = async (req, res) => {
  try {
    const recharges = await Recharge.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      data: recharges,
    });
  } catch (error) {
    logger.error(`Error in getMyRecharges: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch recharge history' });
  }
};
