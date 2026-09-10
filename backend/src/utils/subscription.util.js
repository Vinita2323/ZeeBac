/**
 * Subscription utility module enforcing business rules:
 * - ACTIVE: Visible on user map/search + Cashback allowed (if wallet balance > 0)
 * - EXPIRED (<= 24 hours ago): Visible in search/map listings (grace period) + Cashback blocked
 * - EXPIRED (> 24 hours ago): Hidden from search/map listings + Cashback blocked
 * - NONE: Hidden from search/map listings + Cashback blocked
 */

export const GRACE_PERIOD_HOURS = 24;
export const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;

/**
 * Evaluates the live subscription and cashback state for a vendor.
 * Automatically accounts for whether expiresAt has elapsed even if the database
 * status field hasn't been updated by a background cron yet.
 *
 * @param {object} vendor - Mongoose document or plain object
 * @param {number|null} [walletBalance=null] - Optional vendor wallet balance
 * @returns {object} Detailed state
 */
export const getVendorSubscriptionState = (vendor, walletBalance = null) => {
  const sub = vendor?.subscription || {};
  const rawStatus = (sub.status || 'NONE').toUpperCase();
  const now = new Date();

  const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : null;
  // If expiredAt is not explicitly set, fallback to expiresAt if in the past
  const expiredAt = sub.expiredAt ? new Date(sub.expiredAt) : (expiresAt || null);

  let effectiveStatus = rawStatus;
  if (rawStatus === 'ACTIVE' && expiresAt && expiresAt < now) {
    effectiveStatus = 'EXPIRED';
  } else if (rawStatus !== 'ACTIVE' && rawStatus !== 'EXPIRED') {
    effectiveStatus = 'NONE';
  }

  let isStoreVisible = false;
  let inGracePeriod = false;
  let graceExpiresAt = null;
  let hoursRemainingInGrace = 0;

  // 1. ACTIVE → visible + cashback allowed if wallet > 0
  if (effectiveStatus === 'ACTIVE') {
    isStoreVisible = true;
    inGracePeriod = false;
  }
  // 2. EXPIRED
  else if (effectiveStatus === 'EXPIRED') {
    if (expiredAt) {
      const msSinceExpired = now.getTime() - expiredAt.getTime();
      graceExpiresAt = new Date(expiredAt.getTime() + GRACE_PERIOD_MS);

      // EXPIRED + expiredAt <= 24h ago → visible/grace + cashback blocked
      if (msSinceExpired >= 0 && msSinceExpired <= GRACE_PERIOD_MS) {
        isStoreVisible = true;
        inGracePeriod = true;
        hoursRemainingInGrace = Math.max(0, Math.ceil((graceExpiresAt.getTime() - now.getTime()) / (60 * 60 * 1000)));
      } else {
        // EXPIRED + expiredAt > 24h ago → hidden + cashback blocked
        isStoreVisible = false;
        inGracePeriod = false;
        hoursRemainingInGrace = 0;
      }
    } else {
      // EXPIRED without timestamp → hidden + cashback blocked
      isStoreVisible = false;
      inGracePeriod = false;
      hoursRemainingInGrace = 0;
    }
  }
  // 3. NONE → hidden + cashback blocked
  else {
    effectiveStatus = 'NONE';
    isStoreVisible = false;
    inGracePeriod = false;
    hoursRemainingInGrace = 0;
  }

  // Cashback permission logic:
  // Cashback is ONLY allowed if subscription is currently ACTIVE
  const isSubscriptionActive = effectiveStatus === 'ACTIVE';

  let cashbackBlocked = false;
  let cashbackBlockedReason = null;

  if (!isSubscriptionActive) {
    cashbackBlocked = true;
    cashbackBlockedReason = 'Cashback blocked due to subscription expiry';
  } else if (walletBalance !== null && walletBalance !== undefined && Number(walletBalance) <= 0) {
    cashbackBlocked = true;
    cashbackBlockedReason = 'Cashback blocked due to insufficient cashback wallet balance.';
  }

  return {
    effectiveStatus, // 'ACTIVE' | 'EXPIRED' | 'NONE'
    isSubActive: isSubscriptionActive,
    isStoreVisible,
    inGracePeriod,
    graceExpiresAt,
    hoursRemainingInGrace,
    expiresAt,
    expiredAt,
    planType: sub.planType || 'None',
    price: sub.price || 0,
    cashbackBlocked,
    cashbackBlockedReason,
  };
};

/**
 * Generates a MongoDB query object to filter candidate vendors:
 * 1. Verified vendor
 * 2. Active subscription
 *    OR Expired within 24h grace period
 */
export const getStoreVisibilityQuery = (additionalQuery = {}) => {
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

  return {
    ...additionalQuery,
    status: 'Verified',
    $or: [
      // Active plan
      {
        'subscription.status': 'ACTIVE',
        $or: [
          { 'subscription.expiresAt': { $gte: now } },
          { 'subscription.expiresAt': null },
          { 'subscription.expiresAt': { $exists: false } },
        ],
      },
      // Expired within 24h grace period
      {
        'subscription.status': { $in: ['ACTIVE', 'EXPIRED'] },
        'subscription.expiresAt': { $gte: graceCutoff },
      },
      {
        'subscription.status': 'EXPIRED',
        'subscription.expiredAt': { $gte: graceCutoff },
      },
    ],
  };
};

/**
 * Calculates new subscription dates for fresh activation or renewal.
 * If vendor already has an ACTIVE subscription extending into the future,
 * the new duration is appended to current expiresAt (prevents losing paid days).
 * If expired (in grace or beyond) or NONE, starts from now.
 */
export const calculateNewSubscriptionDates = (currentSubscription, durationDays) => {
  const now = new Date();
  const currentExpiresAt = currentSubscription?.expiresAt ? new Date(currentSubscription.expiresAt) : null;
  const currentStatus = currentSubscription?.status;

  let startDate = now;
  let expiresAt;

  if (currentStatus === 'ACTIVE' && currentExpiresAt && currentExpiresAt > now) {
    startDate = currentSubscription.startDate ? new Date(currentSubscription.startDate) : now;
    expiresAt = new Date(currentExpiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  } else {
    startDate = now;
    expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  }

  return {
    startDate,
    expiresAt,
    lastRenewedAt: now,
    expiredAt: null,
    status: 'ACTIVE',
  };
};

/**
 * Resolves plan and authoritative pricing based on vendor's shopType.
 * Frontend price is NEVER trusted.
 */
export const resolvePlanPrice = async (planTypeOrId, shopType) => {
  const SubscriptionPlan = (await import('../models/SubscriptionPlan.js')).default;
  const RewardConfig = (await import('../models/RewardConfig.js')).default;
  const mongoose = (await import('mongoose')).default;

  await SubscriptionPlan.seedDefaultsIfEmpty();

  let plan = null;
  if (planTypeOrId && mongoose.Types.ObjectId.isValid(planTypeOrId)) {
    plan = await SubscriptionPlan.findById(planTypeOrId);
  }
  if (!plan && typeof planTypeOrId === 'string') {
    plan = await SubscriptionPlan.findOne({ planType: planTypeOrId, isActive: true });
    if (!plan) {
      plan = await SubscriptionPlan.findOne({ planType: planTypeOrId });
    }
  }

  const isBrand = shopType === 'Chain & Brand';
  let price = 0;
  let durationDays = 30;
  let planType = 'Monthly';

  if (plan) {
    price = isBrand ? plan.pricing.chainBrand : plan.pricing.independentStore;
    durationDays = plan.durationDays || (plan.planType === 'Monthly' ? 30 : 365);
    planType = plan.planType;
  } else {
    // Fallback to RewardConfig
    const config = (await RewardConfig.findOne()) || {};
    planType = planTypeOrId === 'Yearly' ? 'Yearly' : 'Monthly';
    durationDays = planType === 'Monthly' ? 30 : 365;
    if (planType === 'Monthly') {
      price = isBrand ? (config.brandMonthlyPrice ?? 999) : (config.independentStoreMonthlyPrice ?? 499);
    } else {
      price = isBrand ? (config.brandYearlyPrice ?? 9999) : (config.independentStoreYearlyPrice ?? 4999);
    }
  }

  return {
    plan,
    planId: plan?._id || null,
    planType,
    shopType: isBrand ? 'Chain & Brand' : 'Independent Store',
    price,
    durationDays,
  };
};
