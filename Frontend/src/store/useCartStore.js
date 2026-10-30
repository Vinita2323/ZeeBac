import { create } from 'zustand';

const CART_STORAGE_KEY = 'zeebac_customer_cart';

export const useCartStore = create((set, get) => ({
  vendor: null, // Active vendor for the cart
  items: [], // [{ _id, id, name, price, originalPrice, cashbackPercentage, image, quantity, category }]
  fulfillmentType: 'pickup', // 'pickup' | 'delivery'
  deliveryAddress: '',
  orderNotes: '',

  // Initialize cart from localStorage
  initCart: () => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed?.items)) {
          set({
            items: parsed.items,
            vendor: parsed.vendor || null,
            fulfillmentType: parsed.fulfillmentType || 'pickup',
            deliveryAddress: parsed.deliveryAddress || '',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse cart storage', e);
    }
  },

  // Set active vendor
  setVendor: (vendor) => {
    set({ vendor });
    const current = get();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      items: current.items,
      vendor,
      fulfillmentType: current.fulfillmentType,
      deliveryAddress: current.deliveryAddress
    }));
  },

  // Add product to cart
  addItem: (product, vendor) => {
    const currentVendor = get().vendor;
    let items = [...get().items];

    // If switching to a new vendor and cart has items from another vendor, reset items
    if (currentVendor && vendor && String(currentVendor._id || currentVendor.zeebacId) !== String(vendor._id || vendor.zeebacId) && items.length > 0) {
      items = [];
    }

    const productId = String(product._id || product.id || product.name);
    const existingIndex = items.findIndex(item => String(item._id || item.id) === productId);

    const rawCashback = product.cashbackPercentage ?? product.branding?.cashbackPercentage ?? product.cashbackRate ?? vendor?.cashbackRate ?? 0;
    const cashbackRate = Math.max(0, Math.min(100, Number(rawCashback) || 0));
    const effectiveVendor = vendor || currentVendor;

    if (existingIndex > -1) {
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: items[existingIndex].quantity + 1,
      };
    } else {
      items.push({
        _id: productId,
        id: productId,
        name: product.name,
        price: Number(product.price) || 0,
        originalPrice: Number(product.discountPrice ? product.discountPrice : Math.round(Number(product.price) * 1.15)),
        cashbackPercentage: cashbackRate,
        image: product.image,
        category: product.category || 'General',
        quantity: 1,
      });
    }

    set({ items, vendor: effectiveVendor });
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      items,
      vendor: effectiveVendor,
      fulfillmentType: get().fulfillmentType,
      deliveryAddress: get().deliveryAddress
    }));
  },

  // Update item quantity by delta (+1 or -1)
  updateQuantity: (productId, delta) => {
    const targetId = String(productId);
    let items = [...get().items];
    const index = items.findIndex(item => String(item._id || item.id) === targetId);
    if (index === -1) return;

    const newQuantity = items[index].quantity + delta;
    if (newQuantity <= 0) {
      items.splice(index, 1);
    } else {
      items[index] = { ...items[index], quantity: newQuantity };
    }

    const newVendor = items.length === 0 ? null : get().vendor;
    set({ items, vendor: newVendor });
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      items,
      vendor: newVendor,
      fulfillmentType: get().fulfillmentType,
      deliveryAddress: get().deliveryAddress
    }));
  },

  // Remove specific item from cart
  removeItem: (productId) => {
    const targetId = String(productId);
    const items = get().items.filter(item => String(item._id || item.id) !== targetId);
    const newVendor = items.length === 0 ? null : get().vendor;
    set({ items, vendor: newVendor });
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      items,
      vendor: newVendor,
      fulfillmentType: get().fulfillmentType,
      deliveryAddress: get().deliveryAddress
    }));
  },

  // Clear entire cart
  clearCart: () => {
    set({ items: [], vendor: null, orderNotes: '' });
    localStorage.removeItem(CART_STORAGE_KEY);
  },

  // Get current quantity of a specific item
  getItemQuantity: (productId) => {
    const targetId = String(productId);
    const item = get().items.find(i => String(i._id || i.id) === targetId);
    return item ? item.quantity : 0;
  },

  // Total quantity of items in cart
  getTotalItemsCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },

  // Total gross amount
  getTotalAmount: () => {
    const total = get().items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return Math.round(total * 100) / 100;
  },

  // Total cashback earned on all items in cart
  getTotalCashback: () => {
    const total = get().items.reduce((sum, item) => {
      const itemCashback = Math.round((item.price * item.quantity * (item.cashbackPercentage / 100)) * 100) / 100;
      return sum + itemCashback;
    }, 0);
    return Math.round(total * 100) / 100;
  },

  setFulfillmentType: (fulfillmentType) => {
    set({ fulfillmentType });
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      items: get().items,
      vendor: get().vendor,
      fulfillmentType,
      deliveryAddress: get().deliveryAddress
    }));
  },

  setDeliveryAddress: (deliveryAddress) => {
    set({ deliveryAddress });
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      items: get().items,
      vendor: get().vendor,
      fulfillmentType: get().fulfillmentType,
      deliveryAddress
    }));
  },

  setOrderNotes: (orderNotes) => set({ orderNotes })
}));

export default useCartStore;
