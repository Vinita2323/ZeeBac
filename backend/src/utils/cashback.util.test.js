import { describe, it, expect } from 'vitest';
import { calculateCashback, DEFAULT_CASHBACK_RATE, getMinCashbackRateForShopType, validateVendorCashbackRate } from './cashback.util.js';

describe('calculateCashback', () => {
  it('computes a flat percentage of the bill amount', () => {
    expect(calculateCashback(1590, 5)).toBe(79.5);
  });

  it('rounds to the nearest paisa', () => {
    expect(calculateCashback(33.33, 7)).toBe(2.33);
  });

  it('falls back to the default rate when the vendor rate is missing or invalid', () => {
    expect(calculateCashback(100, undefined)).toBe((100 * DEFAULT_CASHBACK_RATE) / 100);
    expect(calculateCashback(100, null)).toBe((100 * DEFAULT_CASHBACK_RATE) / 100);
    expect(calculateCashback(100, NaN)).toBe((100 * DEFAULT_CASHBACK_RATE) / 100);
  });

  it('treats a 0% rate as intentional, not missing', () => {
    expect(calculateCashback(100, 0)).toBe(0);
  });

  it('caps cashback when maxCashback option is provided', () => {
    expect(calculateCashback(1000, 10, { maxCashback: 50 })).toBe(50);
    expect(calculateCashback(1000, 10, { maxCashback: 200 })).toBe(100);
  });
});

describe('Phase 5 — Shop-Type Rate Minimums & Validation', () => {
  it('returns default shop-type rate minimums (Independent: 2%, Brand: 5%)', () => {
    expect(getMinCashbackRateForShopType('Independent Store')).toBe(2);
    expect(getMinCashbackRateForShopType('Chain & Brand')).toBe(5);
  });

  it('allows dynamic active rule override for minimum rate', () => {
    expect(getMinCashbackRateForShopType('Independent Store', 4)).toBe(4);
  });

  it('validates vendor cashback rate against shop-type minimums', () => {
    expect(validateVendorCashbackRate(1, 'Independent Store').valid).toBe(false);
    expect(validateVendorCashbackRate(2, 'Independent Store').valid).toBe(true);
    expect(validateVendorCashbackRate(4, 'Chain & Brand').valid).toBe(false);
    expect(validateVendorCashbackRate(5, 'Chain & Brand').valid).toBe(true);
  });
});
