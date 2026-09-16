import { describe, it, expect } from 'vitest';
import { cleanIndianPhoneNumber, extractCustomerPhoneFromUpi } from './phone.util.js';

describe('cleanIndianPhoneNumber', () => {
  it('normalizes standard 10-digit mobile number', () => {
    expect(cleanIndianPhoneNumber('9335812345')).toBe('9335812345');
  });

  it('strips +91 and 91 country codes', () => {
    expect(cleanIndianPhoneNumber('+919335812345')).toBe('9335812345');
    expect(cleanIndianPhoneNumber('919335812345')).toBe('9335812345');
    expect(cleanIndianPhoneNumber('+91 93358 12345')).toBe('9335812345');
  });

  it('strips leading 0', () => {
    expect(cleanIndianPhoneNumber('09335812345')).toBe('9335812345');
  });

  it('handles spaces, dashes, and parentheses', () => {
    expect(cleanIndianPhoneNumber('(091) 93358-12345')).toBe('9335812345');
    expect(cleanIndianPhoneNumber('93358-12345')).toBe('9335812345');
  });

  it('rejects invalid numbers', () => {
    expect(cleanIndianPhoneNumber('')).toBeNull();
    expect(cleanIndianPhoneNumber(null)).toBeNull();
    expect(cleanIndianPhoneNumber('1234567890')).toBeNull(); // Starts with 1 (invalid in India)
    expect(cleanIndianPhoneNumber('93358')).toBeNull(); // Less than 10 digits
    expect(cleanIndianPhoneNumber('abcdefghij')).toBeNull();
  });
});

describe('extractCustomerPhoneFromUpi', () => {
  it('extracts phone from PhonePe VPA (@ybl, @axl, @ibl)', () => {
    expect(extractCustomerPhoneFromUpi({ vpa: '9335812345@ybl' })).toBe('9335812345');
    expect(extractCustomerPhoneFromUpi({ vpa: '9876543210@axl' })).toBe('9876543210');
    expect(extractCustomerPhoneFromUpi({ vpa: '8123456789@ibl' })).toBe('8123456789');
  });

  it('extracts phone from Paytm VPA (@paytm, @ptyes, @ptaxis)', () => {
    expect(extractCustomerPhoneFromUpi({ vpa: '9335812345@paytm' })).toBe('9335812345');
    expect(extractCustomerPhoneFromUpi({ vpa: '9876543210@ptyes' })).toBe('9876543210');
    expect(extractCustomerPhoneFromUpi({ vpa: '7123456789@ptaxis' })).toBe('7123456789');
  });

  it('extracts phone from payment.contact (e.g. Google Pay or cards)', () => {
    expect(extractCustomerPhoneFromUpi({
      contact: '+919335812345',
      vpa: 'user.random@okaxis'
    })).toBe('9335812345');
  });

  it('falls back to notes if provided', () => {
    expect(extractCustomerPhoneFromUpi({
      vpa: 'randomname@okhdfcbank',
      notes: { customerPhone: '9335812345' }
    })).toBe('9335812345');
  });

  it('returns null if no valid mobile number is present in VPA or contact', () => {
    expect(extractCustomerPhoneFromUpi({
      vpa: 'john.doe@okaxis',
      contact: null
    })).toBeNull();
  });
});
