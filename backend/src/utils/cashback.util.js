// Single source of truth for turning a bill amount + a vendor's cashback rate
// into a cashback amount. Previously this formula was copy-pasted across six
// call sites with two different fallback defaults (5 vs 10) and inconsistent
// rounding — this is the one place it should ever be computed.
export const DEFAULT_CASHBACK_RATE = 5;

export const calculateCashback = (amount, cashbackRate) => {
  // Number(null) is 0 and Number(undefined) is NaN — treat both the same way
  // (missing → default rate) rather than letting `null` silently become an
  // intentional 0% rate.
  const rate = cashbackRate === null || cashbackRate === undefined ? NaN : Number(cashbackRate);
  const pct = Number.isFinite(rate) ? rate : DEFAULT_CASHBACK_RATE;
  const value = (Number(amount) * pct) / 100;
  return Math.round(value * 100) / 100;
};
