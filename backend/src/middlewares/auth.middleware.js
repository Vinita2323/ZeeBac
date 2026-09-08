import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import Vendor from '../models/Vendor.js';

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
    req.user = {
      ...decoded,
      _id: decoded.id || decoded._id,
      id: decoded.id || decoded._id
    };
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

// Admin Sub-Permission Guard (Super Admin bypasses all checks)
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (req.user.role === 'super_admin') {
      return next();
    }
    if (req.user.role === 'admin' && req.user.permissions && req.user.permissions.includes(permission)) {
      return next();
    }
    // If no explicit permissions array set on JWT, default admin role is granted access
    if (req.user.role === 'admin' && (!req.user.permissions || req.user.permissions.length === 0)) {
      return next();
    }
    logger.warn(`[requirePermission] Access denied for admin ${req.user.id}. Required permission: ${permission}`);
    return res.status(403).json({ success: false, message: `Access denied: missing ${permission} permission` });
  };
};

// Blocks vendors whose onboarding application isn't yet approved from reaching
// trading/dashboard functionality (profile + application endpoints stay open —
// see vendor.routes.js for which routes this is applied to).
export const requireApprovedVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.user.id).select('status applicationStatus');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    if (vendor.status !== 'Verified') {
      return res.status(403).json({
        success: false,
        message: 'Your vendor application is not yet approved.',
        applicationStatus: vendor.applicationStatus,
        status: vendor.status,
      });
    }
    next();
  } catch (error) {
    logger.error(`[requireApprovedVendor] ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
