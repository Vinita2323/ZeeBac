// Single source of truth for cart/checkout charges.
// - Delivery fee, platform fee, GST: set by ADMIN (RewardConfig) → admin's share
// - Packaging: set by each SELLER (vendor.deliverySettings.packagingCharge) → seller's share
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const getPricingConfig = (rewardConfig) => {
  const c = rewardConfig || {};
  const taxEnabled = Boolean(c.enableOrderTax);
  return {
    deliveryCharge: Math.max(0, Number(c.orderDeliveryCharge ?? 40)),
    freeDeliveryAbove: Math.max(0, Number(c.orderFreeDeliveryAbove ?? 0)),
    platformFeeFixed: Math.max(0, Number(c.orderPlatformFeeFixed ?? 0)),
    platformFeePercent: Math.max(0, Number(c.orderPlatformFeePercent ?? 0)),
    taxPercent: taxEnabled && Number.isFinite(Number(c.orderGstTaxPercent)) ? Number(c.orderGstTaxPercent) : 0,
    sellerCommissionPercent: Math.max(0, Number(c.sellerCommissionPercent ?? 0)),
  };
};

export const computeOrderCharges = ({ itemTotal, fulfillmentType, vendor, rewardConfig, tip = 0 }) => {
  const cfg = getPricingConfig(rewardConfig);
  const items = r2(itemTotal);
  const isDelivery = fulfillmentType === 'delivery';

  const deliveryCharge = isDelivery && !(cfg.freeDeliveryAbove > 0 && items >= cfg.freeDeliveryAbove) ? r2(cfg.deliveryCharge) : 0;
  const packagingCharge = isDelivery ? r2(Math.max(0, Number(vendor?.deliverySettings?.packagingCharge || 0))) : 0;
  const platformFee = r2(cfg.platformFeeFixed + (items * cfg.platformFeePercent) / 100);
  const taxAmount = r2((items * cfg.taxPercent) / 100);
  const tipAmount = isDelivery && Number(tip) > 0 ? r2(tip) : 0;
  const grossTotal = r2(items + packagingCharge + deliveryCharge + platformFee + taxAmount + tipAmount);

  return {
    itemTotal: items,
    deliveryCharge,
    packagingCharge,
    platformFee,
    taxAmount,
    taxPercentage: cfg.taxPercent,
    tipAmount,
    grossTotal,
    sellerCommissionPercent: cfg.sellerCommissionPercent,
  };
};

// Seller share of an order (money admin owes the seller).
//   sellerGross   = itemTotal + packaging
//   − pointsRedeemed (paid to the store as coins in its wallet — see coinFlows.util.js)
//   − admin commission (% of the CASH part only: sellerGross − coin-paid part)
//   − Razorpay fee incl. GST (online only)
// Admin keeps: delivery + platform fee + GST + tip, minus the gateway fee it recovers from the seller.
export const computeSellerShare = ({ order, gatewayFee = 0, commissionPercent = 0 }) => {
  const sellerGross = r2(Number(order.itemTotal || 0) + Number(order.packagingCharge || 0));
  const points = r2(order.pointsRedeemed || 0);
  // Coin-paid part of the store's share is credited to the store as coins (coinFlows.util),
  // so only the cash part is settled in money — and commission applies to that cash part only.
  const coinPortion = r2(Math.min(points, sellerGross));
  const cashPortion = r2(sellerGross - coinPortion);
  const commissionAmount = r2((cashPortion * Number(commissionPercent || 0)) / 100);
  const fee = r2(gatewayFee);
  const sellerPayable = Math.max(0, r2(cashPortion - commissionAmount - fee));
  const grossTotal = r2(
    Number(order.itemTotal || 0) +
      Number(order.packagingCharge || 0) +
      Number(order.deliveryCharge || 0) +
      Number(order.platformFee || 0) +
      Number(order.taxAmount || 0) +
      Number(order.tipAmount || 0)
  );
  const customerPaid = r2(order.finalPayableAmount || 0);
  const adminShare = r2(customerPaid - fee - sellerPayable);
  return { sellerGross, pointsRedeemed: points, coinPortion, cashPortion, commissionPercent: Number(commissionPercent || 0), commissionAmount, gatewayFee: fee, sellerPayable, grossTotal, customerPaid, adminShare };
};
