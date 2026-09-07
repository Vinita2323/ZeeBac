import { describe, it, expect } from 'vitest';
import { calculateCashback, DEFAULT_CASHBACK_RATE } from './cashback.util.js';

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
});
