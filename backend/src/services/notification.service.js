import Notification from '../models/Notification.js';
import { firebaseInitialized } from '../config/firebase.admin.js';
import { getMessaging } from 'firebase-admin/messaging';
import { getIO } from '../socket/socket.js';
import logger from '../utils/logger.js';

/**
 * Send notification to a user/vendor
 * - Saves to MongoDB (In-App notification history)
 * - Sends FCM push notification (phone popup)
 * 
 * @param {Object} params
 * @param {string} params.recipientId - MongoDB ObjectId of recipient
 * @param {string} params.recipientType - 'customer' | 'vendor' | 'admin'
 * @param {string[]} params.fcmTokens - Array of FCM tokens
 * @param {string} params.type - 'approval' | 'credit' | 'referral' | 'system' | 'promotion'
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification body
 * @param {string} params.icon - Material icon name
 * @param {string} params.referenceId - Related entity ID (optional)
 * @param {string} params.referenceType - 'transaction' | 'cashback_request' | 'vendor' (optional)
 */
export const sendNotification = async ({
  recipientId,
  recipientType,
  fcmTokens = [],
  type,
  title,
  message,
  icon = 'notifications',
  referenceId,
  referenceType,
  data = {},
}) => {
  try {
    // 1. Save to MongoDB (In-App history)
    const notification = await Notification.create({
      recipientId,
      recipientType,
      type,
      title,
      message,
      icon,
      referenceId,
      referenceType,
      data,
    });

    // 2. Push the notification over the live socket connection so the
    // notification bell updates instantly instead of waiting on polling.
    try {
      const idStr = String(recipientId);
      const room = recipientType === 'vendor' ? `vendor_${idStr}` : `user_${idStr}`;
      getIO().to(room).emit('new_notification', notification);
    } catch (ioErr) {
      logger.warn(`sendNotification: socket emit skipped (${ioErr.message})`);
    }

    // 3. Send FCM Push Notification (if tokens exist and firebase is initialized)
    if (firebaseInitialized && fcmTokens && fcmTokens.length > 0) {
      const response = await getMessaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title,
          body: message,
        },
        data: {
          type: type || 'credit',
          recipientId: String(recipientId),
          recipientType: recipientType || 'customer',
          notificationId: String(notification._id),
          icon: icon || 'notifications',
          referenceId: referenceId ? String(referenceId) : '',
          referenceType: referenceType || '',
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#1e5d90',
            sound: 'default',
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification: {
            title,
            body: message,
            icon: '/Logo (6).png',
            badge: '/Logo (6).png',
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
            data: {
              type: type || 'credit',
              recipientId: String(recipientId),
              recipientType: recipientType || 'customer',
              notificationId: String(notification._id),
              icon: icon || 'notifications',
              referenceId: referenceId ? String(referenceId) : '',
              referenceType: referenceType || '',
              ...data,
            },
          },
        },
      });

      const failed = response.responses.filter(r => !r.success);
      if (failed.length > 0) {
        logger.warn(`FCM: ${failed.length} notifications failed to send`);

        // Automatically clean up expired / unregistered tokens
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errCode = resp.error.code;
            if (
              errCode === 'messaging/registration-token-not-registered' ||
              errCode === 'messaging/invalid-registration-token'
            ) {
              invalidTokens.push(fcmTokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0 && recipientId) {
          try {
            if (recipientType === 'vendor') {
              const Vendor = (await import('../models/Vendor.js')).default;
              await Vendor.findByIdAndUpdate(recipientId, {
                $pull: { fcmTokens: { $in: invalidTokens } },
              });
            } else if (recipientType === 'admin') {
              const AdminUser = (await import('../models/AdminUser.js')).default;
              await AdminUser.findByIdAndUpdate(recipientId, {
                $pull: { fcmTokens: { $in: invalidTokens } },
              });
            } else {
              const User = (await import('../models/User.js')).default;
              await User.findByIdAndUpdate(recipientId, {
                $pull: { fcmTokens: { $in: invalidTokens } },
              });
            }
            logger.info(`FCM: Cleaned up ${invalidTokens.length} expired tokens for ${recipientType} ${recipientId}`);
          } catch (cleanErr) {
            logger.warn(`FCM token cleanup error: ${cleanErr.message}`);
          }
        }
      }
      logger.info(`FCM: Sent to ${response.successCount}/${fcmTokens.length} devices`);
    }
  } catch (error) {
    // Notification failure should NOT break the main flow
    logger.error(`sendNotification error: ${error.message}`);
  }
};
