import DeliveryPartner from '../models/DeliveryPartner.js';
import { getIO } from '../socket/socket.js';
import logger from './logger.js';

// Riders with no app activity (orders poll, GPS update or socket connect) for this long
// are switched OFFLINE automatically — unless they are on an active delivery.
export const RIDER_INACTIVE_MS = Number(process.env.RIDER_INACTIVE_MINUTES || 10) * 60 * 1000;
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;

/** Cheap heartbeat — records that the rider app is alive. Never throws. */
export const touchRiderLastSeen = (riderId) =>
  DeliveryPartner.updateOne({ _id: riderId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});

/**
 * Send a new delivery order alert ONLY to riders who can take it right now:
 * approved, online, no active order. (Previously broadcast to every connected socket.)
 */
export const emitNewDeliveryOrderToOnlineRiders = async (payload) => {
  try {
    const io = getIO();
    const riders = await DeliveryPartner.find({
      isOnline: true,
      applicationStatus: 'APPROVED',
      $or: [{ activeOrderId: null }, { activeOrderId: { $exists: false } }],
    })
      .select('_id')
      .lean();
    if (!riders.length) return 0;
    io.to(riders.map((r) => `rider_${r._id}`)).emit('delivery:new_order', payload);
    return riders.length;
  } catch (err) {
    logger.warn(`[riderPresence] new order emit skipped: ${err.message}`);
    return 0;
  }
};

/** Switch inactive riders offline. Returns number of riders updated. */
export const sweepInactiveRiders = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - RIDER_INACTIVE_MS);
  const filter = {
    isOnline: true,
    $and: [
      { $or: [{ activeOrderId: null }, { activeOrderId: { $exists: false } }] },
      {
        $or: [
          { lastSeenAt: { $lt: cutoff } },
          // Riders who were online before lastSeenAt existed: fall back to last document update
          { lastSeenAt: { $exists: false }, updatedAt: { $lt: cutoff } },
          { lastSeenAt: null, updatedAt: { $lt: cutoff } },
        ],
      },
    ],
  };
  const stale = await DeliveryPartner.find(filter).select('_id').lean();
  if (!stale.length) return 0;

  const ids = stale.map((r) => r._id);
  await DeliveryPartner.updateMany({ _id: { $in: ids }, ...filter }, { $set: { isOnline: false, status: 'OFFLINE' } });

  try {
    const io = getIO();
    io.to(ids.map((id) => `rider_${id}`)).emit('delivery:auto_offline', {
      isOnline: false,
      message: 'You were set Offline due to inactivity. Go Online again to receive orders.',
    });
  } catch {
    /* socket not initialised (tests) */
  }
  logger.info(`[riderPresence] Auto-offline ${ids.length} inactive rider(s)`);
  return ids.length;
};

export const startRiderPresenceSweep = () => {
  const run = () => sweepInactiveRiders().catch((err) => logger.warn(`[riderPresence] sweep failed: ${err.message}`));
  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
  return timer;
};
