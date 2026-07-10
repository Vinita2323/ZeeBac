import mongoose from 'mongoose';
import AdminUser from '../models/AdminUser.js';
import Notification from '../models/Notification.js';
import logger from './logger.js';
// import { getMessaging } from 'firebase-admin/messaging';

/**
 * Triggers a notification to all active admins.
 * 
 * @param {string} type - Notification type (e.g., 'VENDOR_KYC', 'FRAUD_ALERT', 'SUPPORT_TICKET', 'PAYOUT_REQUEST')
 * @param {string} title - Short title for the notification
 * @param {string} message - Descriptive message
 */
export const notifyAdmins = async (type, title, message) => {
  try {
    // 1. Get all active admins
    const admins = await AdminUser.find({ isActive: true });
    
    if (!admins || admins.length === 0) {
      logger.warn('notifyAdmins: No active admins found in the system.');
      return;
    }

    // 2. Create database notifications for all admins
    const notifs = admins.map(admin => ({
      recipientId: admin._id,
      recipientType: 'admin',
      type,
      title,
      message,
      isRead: false
    }));

    await Notification.insertMany(notifs);
    logger.info(`notifyAdmins: Successfully generated ${type} notification for ${admins.length} admin(s).`);

    // 3. TODO: Firebase Cloud Messaging Push
    // The frontend currently polls/fetches the unread count when they click, 
    // but if we want push notifications even when the tab is closed, 
    // we would iterate over admin.fcmTokens and use getMessaging().sendMulticast(...) here.
    
  } catch (error) {
    logger.error(`notifyAdmins error: ${error.message}`);
  }
};

/**
 * Checks a transaction against fraud rules and notifies admins if flagged.
 * @param {Object} txn - The Transaction document
 */
export const checkAndNotifyFraud = async (txn) => {
  try {
    // Rule 1: High Value Transaction (>= 50,000)
    if (txn.amount >= 50000) {
      await notifyAdmins(
        'FRAUD_ALERT', 
        'High Value Transaction', 
        `A transaction of ₹${txn.amount.toLocaleString()} was flagged at ${txn.vendorName || 'a store'}.`
      );
    }

    // Rule 2: High Volume (Vendor > 10 txns in last hour)
    const Transaction = mongoose.models.Transaction; // Use cached model
    if (Transaction && txn.vendorId) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const count = await Transaction.countDocuments({
        vendorId: txn.vendorId,
        createdAt: { $gte: oneHourAgo }
      });

      // If this is the 11th transaction in the hour, fire alert (so it only fires once per burst ideally, or we can just fire if count >= 11)
      if (count === 11) {
        await notifyAdmins(
          'FRAUD_ALERT', 
          'High Volume Alert', 
          `Vendor ${txn.vendorName || 'ID '+txn.vendorId} received over 10 transactions in the last hour.`
        );
      }
    }
  } catch (error) {
    logger.error(`checkAndNotifyFraud error: ${error.message}`);
  }
};
