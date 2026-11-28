/**
 * Normalizes order line items so image, sku, and variant are populated
 * from either the saved order item snapshot or the populated Product ref.
 */
export function enrichOrderItems(items = []) {
  return items.map((raw) => {
    const item = raw?.toObject ? raw.toObject() : raw;
    const prod = item?.productId && typeof item.productId === 'object' ? item.productId : null;
    const resolvedImage =
      item?.image || prod?.image || (Array.isArray(prod?.images) ? prod.images[0] : null) || null;
    const resolvedSku = item?.sku || prod?.sku || '';
    const resolvedVariant =
      item?.variant || prod?.variant || (prod?.unit && prod.unit !== 'Pcs' ? prod.unit : '') || '';

    return {
      ...item,
      image: resolvedImage,
      sku: resolvedSku,
      variant: resolvedVariant,
    };
  });
}
