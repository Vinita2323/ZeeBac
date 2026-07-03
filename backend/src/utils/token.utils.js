import jwt from 'jsonwebtoken';

// Generate short-lived access token (15 min)
export const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' });

// Generate long-lived refresh token (7 days)
export const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' });

// Send both tokens in response body
export const sendTokens = (res, user) => {
  const payload = { id: user._id, role: user.role, zeebacId: user.zeebacId };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { accessToken, refreshToken };
};
