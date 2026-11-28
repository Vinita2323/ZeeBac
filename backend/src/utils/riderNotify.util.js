/**
 * Notifications for delivery partners:
 *   - saved in-app (Updates page history)
 *   - live socket on room rider_<id>
 *   - phone push (FCM) to every device the rider has enabled alerts on
 * Fire-and-forget: a notification failure never breaks the action that triggered it.
 */
import { firebaseInitialized } from '../config/firebase.admin.js';
import { getMessaging } from 'firebase-admin/messaging';
import { sendNotification } from '../services/notification.service.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import logger from './logger.js';

const ICONS = {
  rider_order: 'two_wheeler',
  rider_payout: 'payments',
  rider_account: 'badge',
  rider_cash: 'account_balance_wallet',
  announcement: 'campaign',
};
// Where tapping the phone notification opens the rider app
const URLS = {
  rider_order: '/delivery/dashboard',
  rider_payout: '/delivery/earnings',
  rider_cash: '/delivery/earnings',
  rider_account: '/delivery/status',
  announcement: '/delivery/updates',
};

export const notifyRider = ({ riderId, type = 'rider_order', title, message, referenceId, referenceType, data = {} }) => {
  if (!riderId || !title || !message) return;
  (async () => {
    const rider = await DeliveryPartner.findById(riderId).select('fcmTokens').lean();
    await sendNotification({
      recipientId: riderId,
      recipientType: 'delivery',
      fcmTokens: rider?.fcmTokens || [],
      type,
      title,
      message,
      icon: ICONS[type] || 'notifications',
      referenceId,
      referenceType,
      data: { ...data, role: 'delivery' },
      url: URLS[type] || '/delivery/updates',
    });
  })().catch((err) => logger.warn(`[notifyRider] ${err.message}`));
};

const BATCH = 500; // FCM multicast limit

/**
 * Push an admin announcement / story / video to the riders it targets (all riders, or only
 * riders whose workingZoneId is in zoneIds). Push only — the item itself is on the Updates page.
 * @returns {{ riders: number, devices: number, sent: number, failed: number, pushEnabled: boolean }}
 */
export const pushRiderUpdate = async (update) => {
  const q = { applicationStatus: 'APPROVED', 'fcmTokens.0': { $exists: true } };
  if (update.zoneIds?.length) q.workingZoneId = { $in: update.zoneIds };
  const riders = await DeliveryPartner.find(q).select('fcmTokens').lean();
  const owners = [];
  const tokens = [];
  for (const r of riders) for (const t of r.fcmTokens || []) {
    tokens.push(t);
    owners.push(r._id);
  }
  const result = { riders: riders.length, devices: tokens.length, sent: 0, failed: 0, pushEnabled: Boolean(firebaseInitialized) };
  if (!firebaseInitialized || !tokens.length) return result;

  const kindLabel = update.kind === 'video' ? 'New training video' : update.kind === 'story' ? 'New story' : 'Zeebac update';
  const body = update.body ? String(update.body).slice(0, 180) : kindLabel;
  const invalid = [];
  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH);
    const res = await getMessaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title: update.title, body },
      data: { type: 'announcement', role: 'delivery', url: '/delivery/updates', updateId: String(update._id) },
      android: { priority: 'high', notification: { sound: 'default' } },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { title: update.title, body, icon: '/Logo (6).png', badge: '/Logo (6).png', data: { url: '/delivery/updates', role: 'delivery' } },
      },
    });
    result.sent += res.successCount;
    result.failed += res.failureCount;
    res.responses.forEach((r, idx) => {
      const code = r.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalid.push({ owner: owners[i + idx], token: chunk[idx] });
      }
    });
  }
  // Drop dead tokens so future pushes stay fast
  for (const { owner, token } of invalid) {
    await DeliveryPartner.updateOne({ _id: owner }, { $pull: { fcmTokens: token } }).catch(() => {});
  }
  logger.info(`[pushRiderUpdate] "${update.title}": ${result.sent}/${result.devices} devices (${result.riders} riders)`);
  return result;
};
