import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production' || process.env.USE_DEFAULT_OTP === 'true';

// Read config from .env or default to reasonable limits
const otpLimit = process.env.OTP_RATE_LIMIT ? parseInt(process.env.OTP_RATE_LIMIT, 10) : (isDev ? 100 : 15);
const otpWindowMs = process.env.OTP_RATE_WINDOW ? parseInt(process.env.OTP_RATE_WINDOW, 10) * 1000 : (15 * 60 * 1000);

// Key generator scopes limit to IP + phone number so users behind shared
// carrier CGNAT (e.g. Jio/Airtel) don't lock each other out
const otpKeyGenerator = (req) => {
  const phone = req.body?.phone ? String(req.body.phone).trim() : '';
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  return phone ? `${ip}_${phone}` : ip;
};

export const otpLimiter = rateLimit({
  windowMs: otpWindowMs,
  limit: otpLimit,
  keyGenerator: otpKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please try again in a few minutes.' },
});

// Generic login brute-force protection.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 100 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in a few minutes.' },
});

// Admin login guards a much more sensitive account and has no account
// lockout at all today — keep this noticeably stricter.
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 50 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in a few minutes.' },
});

