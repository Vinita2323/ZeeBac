import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

// Protect routes — verify accessToken
export const protect = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      logger.warn(`[protect middleware] No token provided`);
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded; // { id, role, zeebacId }
    next();
  } catch (error) {
    logger.error(`[protect middleware] Token failed: ${error.message}`);
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

// Role guard
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      logger.warn(`[requireRole] Access denied for user ${req.user?.id}. Required: ${roles}, Got: ${req.user?.role}`);
      return res.status(403).json({ success: false, message: 'Access denied: insufficient permissions' });
    }
    next();
  };
};
