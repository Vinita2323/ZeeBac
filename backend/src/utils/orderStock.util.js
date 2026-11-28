/**
 * Online-order inventory.
 *  - Store (or admin) accepts an order (leaves PLACED) → item stock is reduced.
 *  - Order cancelled or returned by the rider        → exactly what was reduced is added back.
 * Both steps are recorded on order.stockDeduction and can only happen once per order.
 * Stock never goes below 0: if the store has fewer units than ordered, only what exists is
 * reduced, and only that is restored later.
 */
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import logger from './logger.js';

const opts = (session) => (session ? { session } : {});
// Driver v5 returns { value, ok }, v6 returns the document.
const unwrap = (r) => (r && typeof r === 'object' && 'ok' in r && 'value' in r ? r.value : r);

/** Reduce stock for an order that the store just accepted. Mutates order.stockDeduction. */
export const deductOrderStock = async (order, { session = null } = {}) => {
  // Claim in the DB (not in memory): a rolled-back transaction attempt also rolls back the claim,
  // so a retry deducts again correctly and two concurrent accepts can't both deduct.
  const Order = mongoose.model('Order');
  const claim = await Order.updateOne(
    { _id: order._id, 'stockDeduction.deducted': { $ne: true } },
    { $set: { 'stockDeduction.deducted': true, 'stockDeduction.deductedAt': new Date() } },
    opts(session)
  );
  if (!claim.modifiedCount) return { skipped: 'already deducted' };
  const lines = [];
  for (const item of order.items || []) {
    const qty = Math.floor(Number(item.quantity) || 0);
    if (!item.productId || !mongoose.isValidObjectId(item.productId) || qty <= 0) continue;
    const pid = new mongoose.Types.ObjectId(String(item.productId));
    // Atomic: stock = max(stock - qty, 0); returns the document BEFORE the update.
    const before = unwrap(await Product.collection.findOneAndUpdate(
      { _id: pid, vendorId: new mongoose.Types.ObjectId(String(order.vendorId)) },
      [{ $set: { stock: { $max: [{ $subtract: [{ $ifNull: ['$stock', 0] }, qty] }, 0] } } }],
      { ...opts(session), returnDocument: 'before', includeResultMetadata: false }
    ));
    if (!before) continue; // product deleted or not this store's
    const prev = Math.max(0, Number(before.stock) || 0);
    const taken = Math.min(qty, prev);
    lines.push({ productId: pid, name: item.name || before.name, ordered: qty, quantity: taken });
    if (taken < qty) logger.warn(`[OrderStock] ${order.orderId}: ${item.name} short by ${qty - taken} (had ${prev})`);
    if (taken > 0) {
      await StockMovement.create(
        [
          {
            vendorId: order.vendorId,
            productId: pid,
            productName: item.name || before.name || 'Item',
            movementType: 'OUT',
            quantity: taken,
            previousStock: prev,
            newStock: prev - taken,
            reason: 'ORDER_ACCEPTED',
            referenceId: order._id,
            referenceType: 'Order',
            notes: `Online order ${order.orderId} accepted`,
          },
        ],
        opts(session)
      );
    }
  }
  const sd = { deducted: true, deductedAt: new Date(), restored: false, items: lines };
  await Order.updateOne({ _id: order._id }, { $set: { stockDeduction: sd } }, opts(session));
  order.stockDeduction = sd;
  return { deducted: lines };
};

/** Add back what deductOrderStock took (cancel / rider return). Mutates order.stockDeduction. */
export const restoreOrderStock = async (order, { session = null, reason = 'Order cancelled' } = {}) => {
  const Order = mongoose.model('Order');
  const claim = await Order.findOneAndUpdate(
    { _id: order._id, 'stockDeduction.deducted': true, 'stockDeduction.restored': { $ne: true } },
    { $set: { 'stockDeduction.restored': true, 'stockDeduction.restoredAt': new Date() } },
    { ...opts(session), new: true }
  ).lean();
  if (!claim) return { skipped: 'nothing to restore' };
  const sd = claim.stockDeduction;
  for (const line of sd.items || []) {
    if (!(line.quantity > 0)) continue;
    const before = unwrap(await Product.collection.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(String(line.productId)) },
      { $inc: { stock: line.quantity } },
      { ...opts(session), returnDocument: 'before', includeResultMetadata: false }
    ));
    if (!before) continue;
    const prev = Number(before.stock) || 0;
    await StockMovement.create(
      [
        {
          vendorId: order.vendorId,
          productId: line.productId,
          productName: line.name || before.name || 'Item',
          movementType: 'IN',
          quantity: line.quantity,
          previousStock: prev,
          newStock: prev + line.quantity,
          reason: 'ORDER_RETURN',
          referenceId: order._id,
          referenceType: 'Order',
          notes: `${reason} — order ${order.orderId}`,
        },
      ],
      opts(session)
    );
  }
  order.stockDeduction = sd;
  return { restored: sd.items };
};
