import CashbackRequest from '../models/CashbackRequest.js';

// One customer, across both request types (cash_claim + receipt_claim)
// combined, in a rolling 24 hours — not a calendar day, so it can't be
// gamed by timing a burst of requests right around midnight.
export const DAILY_REQUEST_LIMIT = 3;

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
export const DAILY_CASH_REQUESTS_PER_VENDOR = 3;

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

export class CashDailyShopLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CashDailyShopLimitError';
  }
}

export const assertWithinDailyRequestLimit = async (customerId) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await CashbackRequest.countDocuments({ customerId, createdAt: { $gte: since } });
  if (count >= DAILY_REQUEST_LIMIT) {
    throw new DailyLimitExceededError(
      `You've reached the limit of ${DAILY_REQUEST_LIMIT} cashback requests per day. Please try again later.`
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

  // Check daily limit of 3 cash requests for this same shop
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await CashbackRequest.countDocuments({
    customerId,
    vendorId: vendor._id,
    paymentMethod: 'Cash',
    createdAt: { $gte: since },
    status: { $in: ['Pending', 'Approved', 'Held'] },
  });

  if (count >= DAILY_CASH_REQUESTS_PER_VENDOR) {
    throw new CashDailyShopLimitError(
      `You've reached the daily limit of ${DAILY_CASH_REQUESTS_PER_VENDOR} cash cashback requests for ${vendor.storeName || 'this shop'}.`
    );
  }

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
