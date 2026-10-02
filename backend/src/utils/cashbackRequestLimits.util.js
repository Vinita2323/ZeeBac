import CashbackRequest from '../models/CashbackRequest.js';
import RewardConfig from '../models/RewardConfig.js';

// Fallback only — the real, admin-configurable value lives on RewardConfig
// (dailyCashbackRequestsPerShop), with an optional per-vendor override on
// Vendor.dailyRequestLimitOverride. Used only if no RewardConfig document
// exists yet (e.g. a brand new deployment).
export const DEFAULT_DAILY_REQUESTS_PER_SHOP = 3;

// Receipt claims at/above this amount get flagged for admin visibility
// (notifyAdmins) but are NOT blocked — the vendor still approves/rejects
// normally. Purely a spot-check signal, not a second approval gate.
export const HIGH_VALUE_THRESHOLD = 2000;

// Same customer + vendor + amount within this window almost certainly means
// a double-submit (accidental resubmit, retried request), not two separate
// genuine purchases.
export const DUPLICATE_WINDOW_MINUTES = 10;

// Cash mode anti-fraud rules
export const MAX_CASH_REQUEST_AMOUNT = 1000;
export const MAX_CASH_NEARBY_METERS = 300;

export class DailyLimitExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DailyLimitExceededError';
  }
}

export class DuplicateRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateRequestError';
  }
}

export class CashLimitExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CashLimitExceededError';
  }
}

export class CashLocationRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CashLocationRequiredError';
  }
}

export class CashLocationOutOfRangeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CashLocationOutOfRangeError';
  }
}

// Effective per-shop daily limit for a given vendor: that vendor's own
// override if admin set one, else the platform-wide RewardConfig default.
// Returns null if daily requests are unlimited.
export const getEffectiveDailyRequestLimit = async (vendor) => {
  if (Number.isFinite(vendor?.dailyRequestLimitOverride) && vendor.dailyRequestLimitOverride > 0) {
    return vendor.dailyRequestLimitOverride;
  }
  const config = await RewardConfig.findOne();
  if (!config) {
    return DEFAULT_DAILY_REQUESTS_PER_SHOP;
  }
  if (config.dailyCashbackRequestsPerShop === null) {
    return null;
  }
  if (Number.isFinite(config.dailyCashbackRequestsPerShop) && config.dailyCashbackRequestsPerShop > 0) {
    return config.dailyCashbackRequestsPerShop;
  }
  return null;
};

// One customer, at this ONE shop, across both request types (cash_claim +
// receipt_claim) combined, in a rolling 24 hours — not a calendar day, so it
// can't be gamed by timing a burst of requests right around midnight. Scoped
// per vendor: visiting 3 different shops gets this limit at each one
// independently, not one shared pool across every shop combined.
export const assertWithinDailyRequestLimit = async (customerId, vendor) => {
  const limit = await getEffectiveDailyRequestLimit(vendor);
  if (limit === null || limit === undefined) {
    return; // Unlimited: no limit configured per shop/day
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Deliberately no status filter: a resubmission to the same vendor
  // auto-cancels the customer's own earlier Pending request (see
  // createCustomerTransaction), so filtering to only Pending/Approved/Held
  // would let someone resubmit indefinitely — each attempt cancelling the
  // last — without ever consuming their daily quota. Every genuine
  // submission attempt counts, regardless of what happened to it after.
  const count = await CashbackRequest.countDocuments({
    customerId,
    vendorId: vendor._id,
    createdAt: { $gte: since },
  });
  if (count >= limit) {
    throw new DailyLimitExceededError(
      `You've reached the limit of ${limit} cashback requests per day for ${vendor.storeName || 'this shop'}. Please try again tomorrow or visit another store.`
    );
  }
};

export const assertNoRecentDuplicateRequest = async (customerId, vendorId, amount) => {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000);
  const existing = await CashbackRequest.findOne({
    customerId,
    vendorId,
    amount,
    createdAt: { $gte: since },
    status: { $in: ['Pending', 'Approved', 'Held'] },
  });
  if (existing) {
    throw new DuplicateRequestError('You already submitted a very similar request a few minutes ago.');
  }
};

export const assertCashRequestAllowed = async ({ customerId, vendor, amount, latitude, longitude, haversineDistanceMeters }) => {
  const numAmount = parseFloat(amount);
  if (numAmount > MAX_CASH_REQUEST_AMOUNT) {
    throw new CashLimitExceededError(
      `Cash cashback requests from customer app are limited to ₹${MAX_CASH_REQUEST_AMOUNT}. For cash purchases above ₹${MAX_CASH_REQUEST_AMOUNT}, ask the vendor to generate a one-time bill barcode from their app.`
    );
  }

  // Per-shop daily request count is enforced once, up front, by
  // assertWithinDailyRequestLimit (covers cash_claim + receipt_claim
  // together) — not duplicated here.

  // Geofence check if vendor has coordinates registered
  let distanceFromVendorMeters = null;
  const vendorCoords = vendor.location?.coordinates;
  const hasVendorCoords = Array.isArray(vendorCoords) && vendorCoords.length === 2 && (vendorCoords[0] !== 0 || vendorCoords[1] !== 0);

  if (hasVendorCoords && haversineDistanceMeters) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new CashLocationRequiredError(
        'Location access is required for cash cashback requests to verify you are at the shop.'
      );
    }

    distanceFromVendorMeters = haversineDistanceMeters([lng, lat], vendorCoords);
    if (distanceFromVendorMeters > MAX_CASH_NEARBY_METERS) {
      throw new CashLocationOutOfRangeError(
        `You are ~${distanceFromVendorMeters}m away from the shop. Cash cashback requests can only be made when physically at the shop (within ${MAX_CASH_NEARBY_METERS}m).`
      );
    }
  }

  return { distanceFromVendorMeters };
};
