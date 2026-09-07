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
    status: { $in: ['Pending', 'Approved'] },
  });
  if (existing) {
    throw new DuplicateRequestError('You already submitted a very similar request a few minutes ago.');
  }
};
