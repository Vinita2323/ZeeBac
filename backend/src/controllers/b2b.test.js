import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import Product from '../models/Product.js';
import B2BInvoice from '../models/B2BInvoice.js';
import StockMovement from '../models/StockMovement.js';
import {
  searchB2BProducts,
  searchB2BBuyers,
  createB2BInvoice,
  verifyAndTransferB2BStock,
  getSellerInvoices,
  getBuyerInvoices,
  getManufacturerDashboardStats,
} from './b2b.controller.js';

vi.mock('../socket/index.js', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  }),
}));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const setupManufacturerAndWholesaler = async () => {
  const manufacturer = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Shyam Sharma',
    storeName: 'Shree Shyam Foods Pvt Ltd',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    businessType: 'Manufacturer',
    bankDetails: {
      upiId: 'shreeshyam@upi',
      isVerified: true,
    },
  });

  const wholesaler = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Rajesh Gupta',
    storeName: 'Gupta Wholesale Traders',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    businessType: 'Wholesaler',
    bankDetails: {
      upiId: 'guptawholesale@upi',
      isVerified: true,
    },
  });

  const product = await Product.create({
    vendorId: manufacturer._id,
    name: 'Maggi 2-Minute Noodles 70g',
    category: 'Instant Food',
    brand: 'Maggi',
    barcode: '8901008310247',
    price: 12,
    mrp: 14,
    wholesalePrice: 9.5,
    unit: 'Pcs',
    stock: 500, // Acceptance test initial stock: 500 units
    isActive: true,
    cashbackPercentage: 5,
    description: 'Maggi 2 Minute Noodles best quality',
    image: 'https://example.com/maggi.png',
  });

  return { manufacturer, wholesaler, product };
};

describe('B2B Automatic Product & Stock Transfer Suite', () => {
  it('searches product by barcode for cashier billing software', async () => {
    const { manufacturer, product } = await setupManufacturerAndWholesaler();

    const req = {
      user: { id: manufacturer._id.toString() },
      query: { barcode: '8901008310247' },
    };
    const res = makeRes();

    await searchB2BProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].barcode).toBe('8901008310247');
    expect(body.data[0].stock).toBe(500);
    expect(body.data[0].wholesalePrice).toBe(9.5);
  });

  it('creates B2B invoice with Direct UPI Intent from Manufacturer to Wholesaler', async () => {
    const { manufacturer, wholesaler, product } = await setupManufacturerAndWholesaler();

    const req = {
      user: { id: manufacturer._id.toString() },
      body: {
        buyerId: wholesaler._id.toString(),
        items: [
          {
            productId: product._id.toString(),
            quantity: 100, // 100 units
            rate: 9.5,
          },
        ],
        paymentMethod: 'UPI_INTENT',
      },
    };
    const res = makeRes();

    await createB2BInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.invoice.totalAmount).toBe(950); // 100 * 9.5 = 950
    expect(body.data.invoice.totalQuantity).toBe(100);
    expect(body.data.invoice.paymentStatus).toBe('PENDING');
    expect(body.data.invoice.isTransferred).toBe(false);
    expect(body.data.upiIntentUri).toContain('upi://pay?pa=');
  });

  it('ACCEPTANCE TEST: Manufacturer sells 100 units to Wholesaler. Upon verified payment, Manufacturer stock becomes 400, Wholesaler stock becomes 100 without manual product creation. Repeated confirmation does not change quantities.', async () => {
    const { manufacturer, wholesaler, product } = await setupManufacturerAndWholesaler();

    // 1. Create B2B Invoice for 100 units
    const createReq = {
      user: { id: manufacturer._id.toString() },
      body: {
        buyerId: wholesaler._id.toString(),
        items: [
          {
            productId: product._id.toString(),
            quantity: 100,
            rate: 9.5,
          },
        ],
        paymentMethod: 'UPI_INTENT',
      },
    };
    const createRes = makeRes();
    await createB2BInvoice(createReq, createRes);
    const invoice = createRes.json.mock.calls[0][0].data.invoice;

    // Verify initial stock: Manufacturer = 500, Wholesaler = 0 (product does not even exist for wholesaler)
    const initialMfgProduct = await Product.findById(product._id);
    expect(initialMfgProduct.stock).toBe(500);

    const initialWholesalerProducts = await Product.find({ vendorId: wholesaler._id });
    expect(initialWholesalerProducts.length).toBe(0);

    // 2. Execute verified payment & automatic stock transfer
    const transferReq = {
      user: { id: manufacturer._id.toString() },
      params: { id: invoice._id.toString() },
      body: {
        paymentMethod: 'UPI_INTENT',
        utr: '425512345678', // 12-digit UTR
      },
    };
    const transferRes = makeRes();
    await verifyAndTransferB2BStock(transferReq, transferRes);

    expect(transferRes.status).toHaveBeenCalledWith(200);
    const transferBody = transferRes.json.mock.calls[0][0];
    expect(transferBody.success).toBe(true);
    expect(transferBody.data.invoice.paymentStatus).toBe('PAID');
    expect(transferBody.data.invoice.isTransferred).toBe(true);

    // 3. Verify Acceptance Criteria:
    // Manufacturer stock must be exactly 400
    const updatedMfgProduct = await Product.findById(product._id);
    expect(updatedMfgProduct.stock).toBe(400);

    // Wholesaler must now have this product with stock = 100
    const wholesalerProduct = await Product.findOne({ vendorId: wholesaler._id, barcode: '8901008310247' });
    expect(wholesalerProduct).not.toBeNull();
    expect(wholesalerProduct.name).toBe('Maggi 2-Minute Noodles 70g');
    expect(wholesalerProduct.stock).toBe(100);
    expect(wholesalerProduct.supplierDetails.storeName).toBe('Shree Shyam Foods Pvt Ltd');
    expect(wholesalerProduct.sourceProductId.toString()).toBe(product._id.toString());

    // Check StockMovement ledger has audit trail
    const mfgMovements = await StockMovement.find({ vendorId: manufacturer._id, movementType: 'OUT' });
    expect(mfgMovements.length).toBe(1);
    expect(mfgMovements[0].previousStock).toBe(500);
    expect(mfgMovements[0].newStock).toBe(400);

    const whsMovements = await StockMovement.find({ vendorId: wholesaler._id, movementType: 'IN' });
    expect(whsMovements.length).toBe(1);
    expect(whsMovements[0].previousStock).toBe(0);
    expect(whsMovements[0].newStock).toBe(100);

    // 4. IDEMPOTENCY TEST: Repeat the exact same transfer call
    const repeatTransferRes = makeRes();
    await verifyAndTransferB2BStock(transferReq, repeatTransferRes);

    expect(repeatTransferRes.status).toHaveBeenCalledWith(200);
    const repeatBody = repeatTransferRes.json.mock.calls[0][0];
    expect(repeatBody.alreadyTransferred).toBe(true);

    // Quantities MUST NOT change on repeated confirmation!
    const recheckMfgProduct = await Product.findById(product._id);
    expect(recheckMfgProduct.stock).toBe(400);

    const recheckWholesalerProduct = await Product.findById(wholesalerProduct._id);
    expect(recheckWholesalerProduct.stock).toBe(100);
  });

  it('subsequent B2B purchase increments existing wholesaler stock instead of duplicating listing', async () => {
    const { manufacturer, wholesaler, product } = await setupManufacturerAndWholesaler();

    // First sale of 100 units
    const invoice1Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: {
          buyerId: wholesaler._id.toString(),
          items: [{ productId: product._id.toString(), quantity: 100, rate: 9.5 }],
        },
      },
      invoice1Res
    );
    const invoice1 = invoice1Res.json.mock.calls[0][0].data.invoice;

    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: invoice1._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: '111122223333' },
      },
      makeRes()
    );

    // Wholesaler has 100 units now
    let whsProd = await Product.findOne({ vendorId: wholesaler._id, barcode: '8901008310247' });
    expect(whsProd.stock).toBe(100);

    // Second sale of 50 units
    const invoice2Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: {
          buyerId: wholesaler._id.toString(),
          items: [{ productId: product._id.toString(), quantity: 50, rate: 9.5 }],
        },
      },
      invoice2Res
    );
    const invoice2 = invoice2Res.json.mock.calls[0][0].data.invoice;

    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: invoice2._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: '444455556666' },
      },
      makeRes()
    );

    // Wholesaler stock must now be 150, and wholesaler must still have only 1 product document!
    whsProd = await Product.findOne({ vendorId: wholesaler._id, barcode: '8901008310247' });
    expect(whsProd.stock).toBe(150);

    const totalWholesalerItems = await Product.countDocuments({ vendorId: wholesaler._id });
    expect(totalWholesalerItems).toBe(1);

    // Manufacturer stock: 500 - 100 - 50 = 350
    const mfgProd = await Product.findById(product._id);
    expect(mfgProd.stock).toBe(350);
  });

  it('rejects transfer if UTR is invalid or duplicate', async () => {
    const { manufacturer, wholesaler, product } = await setupManufacturerAndWholesaler();

    const invoiceRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: {
          buyerId: wholesaler._id.toString(),
          items: [{ productId: product._id.toString(), quantity: 20, rate: 9.5 }],
        },
      },
      invoiceRes
    );
    const invoice = invoiceRes.json.mock.calls[0][0].data.invoice;

    // Invalid UTR (only 8 digits)
    const invalidReq = {
      user: { id: manufacturer._id.toString() },
      params: { id: invoice._id.toString() },
      body: { paymentMethod: 'UPI_INTENT', utr: '12345678' },
    };
    const invalidRes = makeRes();
    await verifyAndTransferB2BStock(invalidReq, invalidRes);

    expect(invalidRes.status).toHaveBeenCalledWith(400);

    // Stock must remain unchanged
    const mfgProd = await Product.findById(product._id);
    expect(mfgProd.stock).toBe(500);
  });

  it('computes manufacturer dashboard stats accurately', async () => {
    const { manufacturer, product } = await setupManufacturerAndWholesaler();

    const req = { user: { id: manufacturer._id.toString() } };
    const res = makeRes();

    await getManufacturerDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.totalProducts).toBe(1);
    expect(body.data.activeProducts).toBe(1);
    expect(body.data.totalStockUnits).toBe(500);
  });
});
