import Notification from '../models/Notification.js';
import { firebaseInitialized } from '../config/firebase.admin.js';
import { getMessaging } from 'firebase-admin/messaging';
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
}) => {
  try {
    // 1. Save to MongoDB (In-App history)
    await Notification.create({
      recipientId,
      recipientType,
      type,
      title,
      message,
      icon,
      referenceId,
      referenceType,
    });

    // 2. Send FCM Push Notification (if tokens exist and firebase is initialized)
    if (firebaseInitialized && fcmTokens && fcmTokens.length > 0) {
      const response = await getMessaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title,
          body: message,
        },
        data: {
          type,
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
          notification: {
            icon: '/logo.png',
            badge: '/badge.png',
          },
        },
      });

      const failed = response.responses.filter(r => !r.success);
      if (failed.length > 0) {
        logger.warn(`FCM: ${failed.length} notifications failed to send`);
      }
      logger.info(`FCM: Sent to ${response.successCount}/${fcmTokens.length} devices`);
    }
  } catch (error) {
    // Notification failure should NOT break the main flow
    logger.error(`sendNotification error: ${error.message}`);
  }
};
