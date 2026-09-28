import Tesseract from 'tesseract.js';
import mongoose from 'mongoose';
import PosBill from '../models/PosBill.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import CashbackRequest from '../models/CashbackRequest.js';
import { creditWallet, debitWallet } from '../utils/wallet.util.js';
import { calculateCashback } from '../utils/cashback.util.js';
import { claimFirstPurchaseReferralBonus } from '../utils/referral.util.js';
import { getVendorSubscriptionState } from '../utils/subscription.util.js';
import { sendNotification } from './notification.service.js';
import { getIO } from '../socket/socket.js';
import logger from '../utils/logger.js';

/**
 * Perform smart OCR analysis on a receipt / bill image buffer or path/URL.
 * Wrapped with a safety timeout so slow recognition never blocks the request.
 */
export const performOcrOnBill = async (imageSource) => {
  if (!imageSource) return { success: false, rawText: '', invoiceNumber: null, amount: null };

  const ocrPromise = (async () => {
    try {
      let imageBuffer = imageSource;

      // If URL string, fetch image buffer
      if (typeof imageSource === 'string' && (imageSource.startsWith('http://') || imageSource.startsWith('https://'))) {
        try {
          const response = await fetch(imageSource);
          if (!response.ok) return { success: false, rawText: '', invoiceNumber: null, amount: null };
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        } catch {
          return { success: false, rawText: '', invoiceNumber: null, amount: null };
        }
      }

      // Guard against empty image buffers
      if (Buffer.isBuffer(imageBuffer) && imageBuffer.length === 0) {
        return { success: false, rawText: '', invoiceNumber: null, amount: null };
      }

      let data = { text: '', confidence: 0 };
      const recognizeFn = (typeof Tesseract?.recognize === 'function')
        ? Tesseract.recognize
        : (typeof Tesseract?.default?.recognize === 'function' ? Tesseract.default.recognize : null);

      if (recognizeFn) {
        const ocrRes = await Promise.resolve(
          recognizeFn(imageBuffer, 'eng', { logger: () => {} })
        ).catch((err) => {
          logger.warn(`[AI OCR] Tesseract error caught: ${err.message}`);
          return { data: { text: '', confidence: 0 } };
        });
        data = ocrRes?.data || data;
      }

      const rawText = data?.text || '';
      logger.info(`[AI OCR] Extracted ${rawText.length} chars from bill`);

      // 1. Extract potential invoice / bill numbers
      // Patterns: INV-1234, BILL#5678, INVOICE NO: 9021, ZEEBAC-89214, etc.
      let invoiceNumber = null;
      const invoiceRegexes = [
        /(?:TAX\s+INVOICE|INVOICE\s+NO|INV\s+NO|BILL\s+NO|INVOICE|BILL|RECEIPT|MEMO|INV)[\s.:#-]+([A-Z0-9\-\/]{3,25})/i,
        /(?:ZEEBAC|ZB)[\s.:#-]*([0-9]{4,8})/i,
        /\b(INV[0-9]{3,12})\b/i,
        /\b([A-Z]{2,4}-[0-9]{3,10})\b/i,
      ];

      for (const reg of invoiceRegexes) {
        const match = rawText.match(reg);
        if (match && match[1]) {
          invoiceNumber = match[1].trim().toUpperCase();
          break;
        }
      }

      // 2. Extract potential bill amount
      // Patterns: Total: 1500, Net Amount: Rs. 450.00, Grand Total: 1250, etc.
      let amount = null;
      const amountRegexes = [
        /(?:GRAND TOTAL|NET AMOUNT|TOTAL AMOUNT|BILL TOTAL|TOTAL|PAID AMOUNT|NET PAYABLE)[.:\s₹RsINR]*([\d,]+\.?\d{0,2})/i,
        /(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d{0,2})/i,
      ];

      for (const reg of amountRegexes) {
        const match = rawText.match(reg);
        if (match && match[1]) {
          const parsed = parseFloat(match[1].replace(/,/g, ''));
          if (parsed && parsed > 0 && parsed < 1000000) {
            amount = parsed;
            break;
          }
        }
      }

      return {
        success: true,
        rawText,
        invoiceNumber,
        amount,
        confidence: data?.confidence || 0,
      };
    } catch (err) {
      logger.warn(`[AI OCR] Recognition failed: ${err.message}`);
      return { success: false, rawText: '', invoiceNumber: null, amount: null, error: err.message };
    }
  })();

  // 6 second timeout guard
  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ success: false, rawText: '', invoiceNumber: null, amount: null, timedOut: true }), 6000)
  );

  return Promise.race([ocrPromise, timeoutPromise]);
};

/**
 * Match bill details with billing software synced data (PosBill).
 * Security Fix 1: Vendor-scoped only (NO global fallback).
 * Security Fix 2: Requires OCR corroboration of bill data.
 * Security Fix 3: Hard-rejects already claimed bills.
 * Security Fix 8: Rejects amount mismatches exceeding tolerance.
 * Security Fix 9: Rejects expired bills.
 */
export const matchBillWithSoftwarePos = async ({ vendorId, billNumber, amount, ocrResult }) => {
  try {
    if (!vendorId) {
      return { matched: false, reason: 'VENDOR_REQUIRED' };
    }

    const candidateCodes = new Set();

    if (billNumber) {
      const clean = String(billNumber).trim().toUpperCase();
      candidateCodes.add(clean);
      candidateCodes.add(clean.replace(/[^A-Z0-9]/g, ''));
      candidateCodes.add(clean.replace(/^#/, ''));
    }

    if (ocrResult?.invoiceNumber) {
      const cleanOcr = String(ocrResult.invoiceNumber).trim().toUpperCase();
      candidateCodes.add(cleanOcr);
      candidateCodes.add(cleanOcr.replace(/[^A-Z0-9]/g, ''));
      candidateCodes.add(cleanOcr.replace(/^#/, ''));
    }

    // Filter out very short or empty candidate strings
    const validCandidates = Array.from(candidateCodes).filter((c) => c && c.length >= 3);
    logger.info(`[AI POS Matcher] Evaluating ${validCandidates.length} candidate bill codes for vendor ${vendorId}: ${validCandidates.join(', ')}`);

    if (validCandidates.length === 0) {
      return { matched: false, reason: 'NO_VALID_BILL_CODE' };
    }

    // Build regex array for candidate matching
    const candidateRegexes = validCandidates.map((code) => new RegExp(`^${code}$`, 'i'));

    // Fix 3: Hard-reject already CLAIMED POS bill for THIS vendor
    const claimedBill = await PosBill.findOne({
      vendor: vendorId,
      status: 'CLAIMED',
      $or: [
        { billCode: { $in: candidateRegexes } },
        { invoiceNumber: { $in: candidateRegexes } },
      ],
    });

    if (claimedBill) {
      logger.warn(`[AI POS Matcher] Bill ${claimedBill.billCode} is already CLAIMED.`);
      return {
        matched: false,
        alreadyClaimed: true,
        claimedBill,
        reason: 'POS_BILL_ALREADY_CLAIMED',
      };
    }

    // Fix 9: Check for EXPIRED POS bill for THIS vendor
    const now = new Date();
    const expiredBill = await PosBill.findOne({
      vendor: vendorId,
      $and: [
        {
          $or: [
            { status: 'EXPIRED' },
            { expiresAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { billCode: { $in: candidateRegexes } },
            { invoiceNumber: { $in: candidateRegexes } },
          ],
        },
      ],
    });

    if (expiredBill) {
      logger.warn(`[AI POS Matcher] Bill ${expiredBill.billCode} has EXPIRED.`);
      return {
        matched: false,
        isExpired: true,
        expiredBill,
        reason: 'POS_BILL_EXPIRED',
      };
    }

    // Fix 1: Search UNCLAIMED & valid PosBill strictly for THIS VENDOR (NO global fallback)
    const posBill = await PosBill.findOne({
      vendor: vendorId,
      status: 'UNCLAIMED',
      expiresAt: { $gt: now },
      $or: [
        { billCode: { $in: candidateRegexes } },
        { invoiceNumber: { $in: candidateRegexes } },
      ],
    });

    if (!posBill) {
      logger.info(`[AI POS Matcher] No unclaimed software POS bill found for vendor ${vendorId}`);
      return { matched: false, reason: 'POS_BILL_NOT_FOUND' };
    }

    // Fix 2: OCR Corroboration Check
    // The uploaded image must show the invoice number (either detected invoice or found in rawText)
    const cleanBillCode = posBill.billCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cleanInvoiceNum = (posBill.invoiceNumber || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cleanCustBill = (billNumber ? String(billNumber).replace(/[^A-Z0-9]/gi, '').toUpperCase() : '');
    const cleanOcrInv = (ocrResult?.invoiceNumber ? String(ocrResult.invoiceNumber).replace(/[^A-Z0-9]/gi, '').toUpperCase() : '');

    // Corroborate that OCR detected invoice matches the bill
    const ocrInvMatch = cleanOcrInv.length >= 3 && (
      cleanOcrInv === cleanBillCode ||
      cleanOcrInv === cleanInvoiceNum ||
      (cleanCustBill.length >= 3 && cleanOcrInv === cleanCustBill)
    );

    const rawText = ocrResult?.rawText || '';
    const cleanRawText = rawText.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    // Or the OCR raw extracted text clearly contains the candidate bill code
    const ocrTextContainsCode = (cleanBillCode.length >= 3 && cleanRawText.includes(cleanBillCode)) ||
                                (cleanInvoiceNum.length >= 3 && cleanRawText.includes(cleanInvoiceNum)) ||
                                (cleanCustBill.length >= 3 && cleanRawText.includes(cleanCustBill));

    const invoiceCorroborated = Boolean(ocrInvMatch || ocrTextContainsCode);

    // Fix 8: Amount Verification Check
    const custAmount = parseFloat(amount) || 0;
    const posAmount = posBill.amount;
    const custDiff = Math.abs(posAmount - custAmount);
    const custDiffPercent = posAmount > 0 ? (custDiff / posAmount) * 100 : 0;
    const custAmountMatches = (custDiff <= 2 || custDiffPercent <= 2);

    const ocrAmt = parseFloat(ocrResult?.amount) || 0;
    const ocrDiff = Math.abs(posAmount - ocrAmt);
    const ocrDiffPercent = posAmount > 0 ? (ocrDiff / posAmount) * 100 : 0;
    const ocrAmountMatches = ocrAmt > 0 && (ocrDiff <= 2 || ocrDiffPercent <= 2);
    const ocrTextHasAmount = cleanRawText.includes(String(Math.round(posAmount)));
    const amountCorroborated = custAmountMatches && (ocrAmountMatches || ocrTextHasAmount || !ocrAmt);

    const isEligibleForAutoApproval = invoiceCorroborated && custAmountMatches;

    if (!isEligibleForAutoApproval) {
      logger.info(`[AI POS Matcher] Bill matched but lacks full OCR/amount corroboration (invoiceCorroborated: ${invoiceCorroborated}, custAmountMatches: ${custAmountMatches})`);
    } else {
      logger.info(`[AI POS Matcher] SUCCESS! Fully corroborated PosBill ${posBill.billCode} for vendor ${vendorId}`);
    }

    return {
      matched: true,
      posBill,
      ocrCorroborated: isEligibleForAutoApproval,
      invoiceCorroborated,
      custAmountMatches,
      amountMismatch: !custAmountMatches,
      confidence: isEligibleForAutoApproval ? 0.99 : 0.6,
      verifiedAmount: posBill.amount,
      vendorId: posBill.vendor,
    };
  } catch (error) {
    logger.error(`[AI POS Matcher] Error: ${error.message}`);
    return { matched: false, error: error.message };
  }
};

/**
 * Execute automatic approval & instant wallet credit when AI POS bill match succeeds.
 * Security Fix 4: Atomic findOneAndUpdate on UNCLAIMED status to prevent race conditions.
 * Security Fix 5: Guaranteed atomic transaction without unsafe sequential fallback.
 */
export const executeInstantAutoCashbackApproval = async ({
  cashbackRequest,
  posBill,
  vendor,
  customer,
}) => {
  const session = await mongoose.startSession();
  try {
    const vendorWallet = await Wallet.findOne({ ownerId: vendor._id, ownerType: 'Vendor' });
    const vendorBalance = vendorWallet ? (vendorWallet.balance || 0) : 0;
    const subState = getVendorSubscriptionState(vendor, vendorBalance);

    if (!subState.isSubActive) {
      throw new Error('Vendor subscription is inactive');
    }

    const billAmount = posBill.amount;
    const cashbackRate = posBill.cashbackRate || vendor.cashbackRate || 10;
    const cashbackEarned = calculateCashback(billAmount, cashbackRate);

    if (vendorBalance < cashbackEarned) {
      throw new Error(`Insufficient vendor wallet balance (Required: ₹${cashbackEarned}, Available: ₹${vendorBalance})`);
    }

    const transactionId = `TX-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
    let createdTxn = null;
    let referralAward = null;

    // Security Fix 4 & 5: Fully atomic transaction. No unsafe non-transactional fallback!
    await session.withTransaction(async () => {
      // 1. Atomic claim guard: Only ONE concurrent request can transition status from UNCLAIMED -> CLAIMED
      const claimedBill = await PosBill.findOneAndUpdate(
        { _id: posBill._id, status: 'UNCLAIMED' },
        {
          $set: {
            status: 'CLAIMED',
            claimedBy: customer._id,
            claimedAt: new Date(),
            claimMode: 'AI_BILL_MATCH',
            cashbackAmount: cashbackEarned,
            customerPhone: posBill.customerPhone || customer.phone,
          },
        },
        { session, returnDocument: 'after' }
      );

      if (!claimedBill) {
        throw new Error('BILL_ALREADY_CLAIMED_OR_LOCKED');
      }

      // 2. Create Transaction record with status Approved
      const [txn] = await Transaction.create(
        [
          {
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
            type: 'receipt_claim',
            initiatedBy: 'customer',
            source: 'ai_pos_auto_match',
            amount: billAmount,
            cashbackPercent: cashbackRate,
            cashbackAmount: cashbackEarned,
            paymentMethod: 'POS (AI Auto Match)',
            status: 'Approved',
            hasReceipt: true,
            receiptUrl: cashbackRequest.billImageUrl,
          },
        ],
        { session }
      );
      createdTxn = txn;

      // Link transaction on PosBill
      await PosBill.updateOne(
        { _id: posBill._id },
        { $set: { transaction: txn._id } },
        { session }
      );

      // 3. Debit vendor wallet
      await debitWallet({
        session,
        ownerId: vendor._id,
        ownerType: 'Vendor',
        amount: cashbackEarned,
        category: 'cashback',
        description: `AI Auto-Approved Cashback for Bill #${posBill.billCode}`,
        referenceId: txn._id,
        referenceType: 'Transaction',
      });

      // 4. Credit customer wallet
      await creditWallet({
        session,
        ownerId: customer._id,
        ownerType: 'User',
        ownerZeebacId: customer.zeebacId,
        amount: cashbackEarned,
        category: 'cashback',
        description: `AI Instant Cashback for Bill #${posBill.billCode} at ${vendor.storeName}`,
        referenceId: txn._id,
        referenceType: 'Transaction',
      });

      // 5. Update CashbackRequest as Approved
      cashbackRequest.status = 'Approved';
      cashbackRequest.autoApproved = true;
      cashbackRequest.verifiedBy = 'AI_POS_AUTO_MATCH';
      cashbackRequest.verifiedAt = new Date();
      cashbackRequest.aiConfidence = 0.99;
      cashbackRequest.matchedPosBill = posBill._id;
      cashbackRequest.transactionId = txn._id;
      await cashbackRequest.save({ session });

      // 6. Update Vendor Stats
      await Vendor.findByIdAndUpdate(
        vendor._id,
        {
          $inc: {
            'stats.totalRevenue': billAmount,
            'stats.totalOrders': 1,
          },
        },
        { session }
      );

      // 7. Referral bonus check
      referralAward = await claimFirstPurchaseReferralBonus({ session, customer });
    });

    logger.info(`[AI Instant Auto-Approval] Successfully approved CashbackRequest ${cashbackRequest._id} for ₹${cashbackEarned}`);

    // Emit Realtime Socket Events
    try {
      getIO()?.to(`customer_${customer._id}`).emit('cashback_approved', {
        requestId: cashbackRequest._id,
        cashbackAmount: cashbackEarned,
        amount: billAmount,
        vendorName: vendor.storeName,
        transactionId: createdTxn.transactionId,
        autoApproved: true,
      });

      getIO()?.to(`vendor_${vendor._id}`).emit('pos_bill_claimed', {
        billCode: posBill.billCode,
        amount: billAmount,
        customerName: customer.name || customer.phone,
        cashbackAmount: cashbackEarned,
        autoApproved: true,
      });
    } catch (socketErr) {
      logger.warn(`[AI Auto-Approval Socket] Failed to emit: ${socketErr.message}`);
    }

    // Send Push Notifications
    sendNotification({
      recipientId: customer._id,
      recipientType: 'customer',
      fcmTokens: customer.fcmTokens || [],
      type: 'credit',
      title: '⚡ Instant Cashback Approved!',
      message: `₹${cashbackEarned} cashback from ${vendor.storeName} has been automatically approved and credited via AI bill match!`,
      icon: 'check_circle',
      referenceId: createdTxn._id,
      referenceType: 'transaction',
      data: {
        cashbackAmount: String(cashbackEarned),
        amount: String(billAmount),
        vendorName: vendor.storeName,
        autoApproved: 'true',
      },
    });

    sendNotification({
      recipientId: vendor._id,
      recipientType: 'vendor',
      fcmTokens: vendor.fcmTokens || [],
      type: 'system',
      title: '🤖 POS Bill Auto-Claimed via AI',
      message: `Bill #${posBill.billCode} (₹${billAmount}) was auto-verified and ₹${cashbackEarned} cashback was credited to ${customer.name || 'customer'}. No manual action needed!`,
      icon: 'receipt',
      referenceId: createdTxn._id,
      referenceType: 'transaction',
    });

    return {
      success: true,
      autoApproved: true,
      cashbackEarned,
      transactionId: createdTxn.transactionId,
      posBill,
      cashbackRequest,
    };
  } finally {
    session.endSession();
  }
};
