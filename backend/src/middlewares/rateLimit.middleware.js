import rateLimit from 'express-rate-limit';

// A phone number can request at most 5 OTPs per 15 minutes from a given IP —
// today this endpoint has no limit at all, so it can be used to SMS-bomb any
// phone number for free, and (once real OTP verification lands) to
// brute-force the 4-digit code by requesting fresh attempts.
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please try again in a few minutes.' },
});

// Generic login brute-force protection.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in a few minutes.' },
});

// Admin login guards a much more sensitive account and has no account
// lockout at all today — keep this noticeably stricter.
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in a few minutes.' },
});
