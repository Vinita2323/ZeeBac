// Single source of truth for turning a bill amount + a vendor's cashback rate
// into a cashback amount, enforcing shop-type minimum bounds and cashback caps.
export const DEFAULT_CASHBACK_RATE = 5;

export const SHOP_TYPE_MIN_RATES = {
  'Independent Store': 2,
  'Chain & Brand': 5,
};

export const getMinCashbackRateForShopType = (shopType, activeRuleMin = null) => {
  if (activeRuleMin !== null && activeRuleMin !== undefined && Number.isFinite(Number(activeRuleMin))) {
    return Number(activeRuleMin);
  }
  return SHOP_TYPE_MIN_RATES[shopType] ?? 2;
};

export const validateVendorCashbackRate = (cashbackRate, shopType, activeRuleMin = null) => {
  const rate = Number(cashbackRate);
  const minRate = getMinCashbackRateForShopType(shopType, activeRuleMin);
  if (!Number.isFinite(rate) || rate < minRate || rate > 100) {
    return { valid: false, minRate };
  }
  return { valid: true, minRate };
};

export const calculateCashback = (amount, cashbackRate, options = {}) => {
  const rate = cashbackRate === null || cashbackRate === undefined ? NaN : Number(cashbackRate);
  const pct = Number.isFinite(rate) ? rate : DEFAULT_CASHBACK_RATE;
  let value = (Number(amount) * pct) / 100;
  value = Math.round(value * 100) / 100;

  if (options.maxCashback && Number.isFinite(Number(options.maxCashback)) && options.maxCashback > 0) {
    value = Math.min(value, Number(options.maxCashback));
  }

  return value;
};
