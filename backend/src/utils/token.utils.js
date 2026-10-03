import jwt from 'jsonwebtoken';

// Generate access token (30 days default or configured in .env)
export const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || process.env.JWT_ACCESS_EXPIRY || '30d'
  });

// Generate refresh token (365 days default or configured in .env)
export const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || process.env.JWT_REFRESH_EXPIRY || '365d'
  });

// Send both tokens in response body
export const sendTokens = (res, user) => {
  const role = user.role || (user.storeName || user.ownerName ? 'vendor' : 'customer');
  const payload = { id: user._id, role, zeebacId: user.zeebacId };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { accessToken, refreshToken };
};
