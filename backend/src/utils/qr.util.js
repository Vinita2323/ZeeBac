import jwt from 'jsonwebtoken';

// Separate secret from the auth tokens on purpose — rotating/revoking QR
// tokens shouldn't force every logged-in session to re-authenticate, and
// vice versa. Falls back to the access-token secret only so a fresh clone
// of the repo doesn't hard-crash before QR_TOKEN_SECRET is set.
const QR_TOKEN_SECRET = process.env.QR_TOKEN_SECRET || process.env.JWT_ACCESS_SECRET || 'zeebac_default_qr_secret_key_fallback_2026';

// A vendor's QR is meant to be displayed on a counter/screen for many
// customers to scan over a business day, so it gets a long TTL.
export const VENDOR_QR_TTL_SECONDS = 24 * 60 * 60; // 24h

// A customer's QR is shown live, once, at checkout for a vendor to scan —
// short-lived so a screenshot of it can't be reused later or by someone else.
export const CUSTOMER_QR_TTL_SECONDS = 15 * 60; // 15m

export const signQrToken = ({ type, id, zeebacId }, ttlSeconds) =>
  jwt.sign({ type, id, zeebacId }, QR_TOKEN_SECRET, { expiresIn: ttlSeconds });

// Throws (jwt.verify's own errors: TokenExpiredError / JsonWebTokenError) if
// the token is invalid, tampered with, or expired.
export const verifyQrToken = (token) => jwt.verify(token, QR_TOKEN_SECRET);

// A signed token is always three dot-separated base64url segments — no
// legitimate Zeebac ID (ZBV-1234 / ZBC-1234) or phone number ever contains a
// dot, so this reliably tells "this came from a scanned QR" apart from
// "this was typed in manually" without changing the manual-entry UX at all.
export const looksLikeQrToken = (value) => typeof value === 'string' && value.split('.').length === 3;
