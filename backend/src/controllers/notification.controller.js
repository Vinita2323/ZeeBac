import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import logger from '../utils/logger.js';

// ─── Get My Notifications ───
export const getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const recipientType = req.user.role === 'customer' ? 'customer' : req.user.role === 'vendor' ? 'vendor' : 'admin';
    
    const notifications = await Notification.find({ recipientId: req.user.id, recipientType })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await Notification.countDocuments({ recipientId: req.user.id, recipientType });
    
    res.status(200).json({ success: true, data: notifications, total, page: parseInt(page) });
  } catch (error) {
    logger.error(`getMyNotifications error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Get Unread Count (for bell badge) ───
export const getUnreadCount = async (req, res) => {
  try {
    const recipientType = req.user.role === 'customer' ? 'customer' : req.user.role === 'vendor' ? 'vendor' : 'admin';
    const count = await Notification.countDocuments({ recipientId: req.user.id, recipientType, isRead: false });
    res.status(200).json({ success: true, count });
  } catch (error) {
    logger.error(`getUnreadCount error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Mark Single Notification as Read ───
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    logger.error(`markAsRead error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Mark All Notifications as Read ───
export const markAllRead = async (req, res) => {
  try {
    const recipientType = req.user.role === 'customer' ? 'customer' : req.user.role === 'vendor' ? 'vendor' : 'admin';
    await Notification.updateMany(
      { recipientId: req.user.id, recipientType, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error(`markAllRead error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Save FCM Token (User) ───
export const saveUserFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    
    // Add token only if not already saved (avoid duplicates)
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { fcmTokens: token }
    });
    res.status(200).json({ success: true, message: 'FCM token saved' });
  } catch (error) {
    logger.error(`saveUserFcmToken error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Save FCM Token (Vendor) ───
export const saveVendorFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    
    await Vendor.findByIdAndUpdate(req.user.id, {
      $addToSet: { fcmTokens: token }
    });
    res.status(200).json({ success: true, message: 'FCM token saved' });
  } catch (error) {
    logger.error(`saveVendorFcmToken error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
