import { describe, it, expect } from 'vitest';
import { signQrToken, verifyQrToken, looksLikeQrToken, VENDOR_QR_TTL_SECONDS, CUSTOMER_QR_TTL_SECONDS } from './qr.util.js';

describe('signQrToken / verifyQrToken', () => {
  it('round-trips the payload', () => {
    const token = signQrToken({ type: 'vendor', id: 'abc123', zeebacId: 'ZBV-0001' }, VENDOR_QR_TTL_SECONDS);
    const decoded = verifyQrToken(token);
    expect(decoded.type).toBe('vendor');
    expect(decoded.zeebacId).toBe('ZBV-0001');
  });

  it('rejects a tampered token', () => {
    const token = signQrToken({ type: 'customer', id: 'xyz', zeebacId: 'ZBC-0001' }, CUSTOMER_QR_TTL_SECONDS);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => verifyQrToken(tampered)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signQrToken({ type: 'customer', id: 'xyz', zeebacId: 'ZBC-0001' }, -1); // already expired
    expect(() => verifyQrToken(token)).toThrow(/expired/i);
  });
});

describe('looksLikeQrToken', () => {
  it('recognizes a real JWT shape', () => {
    const token = signQrToken({ type: 'vendor', id: '1', zeebacId: 'ZBV-0001' }, 60);
    expect(looksLikeQrToken(token)).toBe(true);
  });

  it('does not mistake a manually-typed Zeebac ID or phone number for a token', () => {
    expect(looksLikeQrToken('ZBV-1234')).toBe(false);
    expect(looksLikeQrToken('9999999999')).toBe(false);
    expect(looksLikeQrToken('')).toBe(false);
    expect(looksLikeQrToken(undefined)).toBe(false);
  });
});
