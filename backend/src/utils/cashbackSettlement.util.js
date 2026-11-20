import Vendor from '../models/Vendor.js';
import CashbackSettlement from '../models/CashbackSettlement.js';
import logger from './logger.js';

/**
 * Calculates current redemption capacity & settlement balance for a merchant.
 * 
 * Formula:
 * Total Redemption Capacity = Total Cashback Issued + Additional Limit (default 1000)
 * Remaining Capacity = Total Capacity - Total Cashback Redeemed
 * Net Balance = Total Cashback Issued - Total Cashback Redeemed
 * 
 * Net Balance interpretation:
 * - Positive (> 0): Merchant owes Zeebac
 * - Negative (< 0): Zeebac owes Merchant
 * - Zero (0): Settled / No settlement due
 */
export const getVendorRedemptionCapacity = (vendor) => {
  if (!vendor) {
    return {
      totalCapacity: 1000,
      remainingCapacity: 1000,
      canRedeemPoints: true,
      additionalLimit: 1000,
      cashbackIssued: 0,
      cashbackRedeemed: 0,
      netSettlementBalance: 0,
      settlementStatus: 'SETTLED',
    };
  }

  const cashbackIssued = Math.round((Number(vendor.cashbackIssued) || 0) * 100) / 100;
  const additionalLimit = vendor.additionalRedemptionLimit !== undefined && vendor.additionalRedemptionLimit !== null
    ? Math.max(0, Number(vendor.additionalRedemptionLimit))
    : 1000;
  const cashbackRedeemed = Math.round((Number(vendor.cashbackRedeemed) || 0) * 100) / 100;

  const totalCapacity = Math.round((cashbackIssued + additionalLimit) * 100) / 100;
  const remainingCapacity = Math.max(0, Math.round((totalCapacity - cashbackRedeemed) * 100) / 100);
  const netSettlementBalance = Math.round((cashbackIssued - cashbackRedeemed) * 100) / 100;

  let settlementStatus = 'SETTLED';
  if (netSettlementBalance > 0) {
    settlementStatus = 'MERCHANT_OWES_ZEEBAC';
  } else if (netSettlementBalance < 0) {
    settlementStatus = 'ZEEBAC_OWES_MERCHANT';
  }

  return {
    totalCapacity,
    remainingCapacity,
    canRedeemPoints: remainingCapacity > 0,
    additionalLimit,
    cashbackIssued,
    cashbackRedeemed,
    netSettlementBalance,
    settlementStatus,
  };
};

/**
 * Atomically records cashback issued by a vendor.
 * Updates vendor.cashbackIssued and appends an auditable ledger record.
 */
export const recordCashbackIssuance = async ({
  vendorId,
  amount,
  customer,
  orderId,
  billNumber,
  paymentMethod = 'Online',
  eligiblePaidAmount = 0,
  cashbackPercentage = 0,
  referenceId = null,
  referenceType = 'Order',
  notes = '',
  session = null,
}) => {
  const parsedAmount = Math.round((Number(amount) || 0) * 100) / 100;
  if (parsedAmount <= 0) return null;

  const updateOpts = session ? { session, new: true } : { new: true };
  const updatedVendor = await Vendor.findByIdAndUpdate(
    vendorId,
    { $inc: { cashbackIssued: parsedAmount } },
    updateOpts
  );

  if (!updatedVendor) {
    logger.warn(`[recordCashbackIssuance] Vendor ${vendorId} not found`);
    return null;
  }

  const capacity = getVendorRedemptionCapacity(updatedVendor);

  const settlement = new CashbackSettlement({
    vendorId: updatedVendor._id,
    vendorZeebacId: updatedVendor.zeebacId || 'ZBV-MERCHANT',
    storeName: updatedVendor.storeName || 'Partner Store',
    type: 'ISSUED',
    amount: parsedAmount,
    customerId: customer?._id || customer?.id || null,
    customerZeebacId: customer?.zeebacId || null,
    customerName: customer?.name || null,
    orderId: orderId || null,
    billNumber: billNumber || null,
    paymentMethod,
    eligiblePaidAmount,
    cashbackPercentage,
    referenceId,
    referenceType,
    notes: notes || `Cashback points issued for ${referenceType} ${orderId || billNumber || ''}`,
    cashbackIssuedAfter: capacity.cashbackIssued,
    cashbackRedeemedAfter: capacity.cashbackRedeemed,
    netBalanceAfter: capacity.netSettlementBalance,
    remainingCapacityAfter: capacity.remainingCapacity,
  });

  if (session) {
    await settlement.save({ session });
  } else {
    await settlement.save();
  }

  return { settlement, capacity };
};

/**
 * Atomically records customer points redeemed at a vendor's shop.
 * Updates vendor.cashbackRedeemed and appends an auditable ledger record.
 */
export const recordCashbackRedemption = async ({
  vendorId,
  amount,
  customer,
  orderId,
  billNumber,
  paymentMethod = 'Points',
  referenceId = null,
  referenceType = 'Order',
  notes = '',
  session = null,
}) => {
  const parsedAmount = Math.round((Number(amount) || 0) * 100) / 100;
  if (parsedAmount <= 0) return null;

  const updateOpts = session ? { session, new: true } : { new: true };
  const updatedVendor = await Vendor.findByIdAndUpdate(
    vendorId,
    { $inc: { cashbackRedeemed: parsedAmount } },
    updateOpts
  );

  if (!updatedVendor) {
    logger.warn(`[recordCashbackRedemption] Vendor ${vendorId} not found`);
    return null;
  }

  const capacity = getVendorRedemptionCapacity(updatedVendor);

  const settlement = new CashbackSettlement({
    vendorId: updatedVendor._id,
    vendorZeebacId: updatedVendor.zeebacId || 'ZBV-MERCHANT',
    storeName: updatedVendor.storeName || 'Partner Store',
    type: 'REDEEMED',
    amount: parsedAmount,
    customerId: customer?._id || customer?.id || null,
    customerZeebacId: customer?.zeebacId || null,
    customerName: customer?.name || null,
    orderId: orderId || null,
    billNumber: billNumber || null,
    paymentMethod,
    referenceId,
    referenceType,
    notes: notes || `Customer redeemed ${parsedAmount} points for ${referenceType} ${orderId || billNumber || ''}`,
    cashbackIssuedAfter: capacity.cashbackIssued,
    cashbackRedeemedAfter: capacity.cashbackRedeemed,
    netBalanceAfter: capacity.netSettlementBalance,
    remainingCapacityAfter: capacity.remainingCapacity,
  });

  if (session) {
    await settlement.save({ session });
  } else {
    await settlement.save();
  }

  return { settlement, capacity };
};
