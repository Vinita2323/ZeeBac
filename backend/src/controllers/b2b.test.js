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
  getAdminB2BInvoices,
  getAdminStockLedger,
  getAdminSupplyChainCatalogue,
} from './b2b.controller.js';
import { updateProduct } from './vendor.controller.js';

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

// Helper: Setup full 4-tier supply chain accounts
const setupFullSupplyChain = async () => {
  const manufacturer = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Shyam Sharma',
    storeName: 'Shree Shyam Foods Pvt Ltd',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    businessType: 'Manufacturer',
    bankDetails: { upiId: 'mfg@upi', isVerified: true },
  });

  const wholesaler = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Rajesh Gupta',
    storeName: 'Gupta Wholesale Traders',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    businessType: 'Wholesaler',
    bankDetails: { upiId: 'whs@upi', isVerified: true },
  });

  const distributor = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Vikram Mehta',
    storeName: 'Mehta Regional Distributors',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    businessType: 'Distributor',
    bankDetails: { upiId: 'dist@upi', isVerified: true },
  });

  const retailer = await Vendor.create({
    zeebacId: `ZBV-${Math.floor(10000 + Math.random() * 90000)}`,
    ownerName: 'Amit Verma',
    storeName: 'Verma Daily Mart',
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    status: 'Verified',
    businessType: 'Retailer',
    bankDetails: { upiId: 'ret@upi', isVerified: true },
  });

  // Single Master Product uploaded by Manufacturer
  const masterProduct = await Product.create({
    vendorId: manufacturer._id,
    productId: 'ZBP-100200',
    barcode: '8901008310247',
    name: 'Maggi 2-Minute Noodles 70g',
    category: 'Instant Food',
    brand: 'Nestle',
    price: 14,
    mrp: 14,
    wholesalePrice: 10,
    unit: 'Pcs',
    stock: 500, // Initial manufacturer stock
    isActive: true,
    cashbackPercentage: 5,
    description: 'Authentic 2-minute instant noodles pack',
    image: 'https://example.com/maggi.png',
    sourceProductId: null,
  });

  return { manufacturer, wholesaler, distributor, retailer, masterProduct };
};

describe('End-to-End ZeeBac Supply Chain & B2B Billing Suite (Tests A to J)', () => {
  // TEST A: Product Master Upload
  it('Test A: Manufacturer product master upload initializes single root product with ID, barcode & cashback', async () => {
    const { manufacturer, masterProduct } = await setupFullSupplyChain();

    expect(masterProduct.productId).toBe('ZBP-100200');
    expect(masterProduct.barcode).toBe('8901008310247');
    expect(masterProduct.cashbackPercentage).toBe(5);
    expect(masterProduct.stock).toBe(500);
    expect(masterProduct.sourceProductId).toBeNull();
    expect(masterProduct.vendorId.toString()).toBe(manufacturer._id.toString());
  });

  // TEST B: Barcode / Product ID lookup
  it('Test B: Barcode & Product ID lookup returns product details for cashier billing and master catalogue', async () => {
    const { manufacturer, masterProduct } = await setupFullSupplyChain();

    // 1. Search by barcode within seller's stock
    const barcodeReq = {
      user: { id: manufacturer._id.toString() },
      query: { barcode: '8901008310247' },
    };
    const barcodeRes = makeRes();
    await searchB2BProducts(barcodeReq, barcodeRes);

    expect(barcodeRes.status).toHaveBeenCalledWith(200);
    const barcodeBody = barcodeRes.json.mock.calls[0][0];
    expect(barcodeBody.success).toBe(true);
    expect(barcodeBody.data.length).toBe(1);
    expect(barcodeBody.data[0].productId).toBe('ZBP-100200');
    expect(barcodeBody.data[0].stock).toBe(500);

    // 2. Search by unique Product ID
    const prodIdReq = {
      user: { id: manufacturer._id.toString() },
      query: { productId: 'ZBP-100200' },
    };
    const prodIdRes = makeRes();
    await searchB2BProducts(prodIdReq, prodIdRes);

    expect(prodIdRes.status).toHaveBeenCalledWith(200);
    const prodIdBody = prodIdRes.json.mock.calls[0][0];
    expect(prodIdBody.success).toBe(true);
    expect(prodIdBody.data[0].barcode).toBe('8901008310247');

    // 3. Search via master catalogue mode (accessible across network)
    const catReq = {
      user: { id: manufacturer._id.toString() },
      query: { catalogue: 'true', query: 'Maggi' },
    };
    const catRes = makeRes();
    await searchB2BProducts(catReq, catRes);
    const catBody = catRes.json.mock.calls[0][0];
    expect(catBody.success).toBe(true);
    expect(catBody.data.length).toBeGreaterThanOrEqual(1);
  });

  // TEST C: Manufacturer -> Wholesaler Billing & Automatic Transfer
  it('Test C: Manufacturer sells 100 units to Wholesaler with verified UPI; transfers stock (500 -> 400, 0 -> 100)', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    // Create Invoice
    const invoiceRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: {
          buyerId: wholesaler._id.toString(),
          items: [{ productId: masterProduct._id.toString(), quantity: 100, rate: 10 }],
          paymentMethod: 'UPI_INTENT',
        },
      },
      invoiceRes
    );

    const invoice = invoiceRes.json.mock.calls[0][0].data.invoice;
    expect(invoice.totalAmount).toBe(1000); // 100 * 10
    expect(invoice.totalQuantity).toBe(100);

    // Verify & Transfer
    const transferRes = makeRes();
    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: invoice._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: '556677889900' },
      },
      transferRes
    );

    expect(transferRes.status).toHaveBeenCalledWith(200);

    // Manufacturer stock becomes 400
    const updatedMfg = await Product.findById(masterProduct._id);
    expect(updatedMfg.stock).toBe(400);

    // Wholesaler stock becomes 100 with root sourceProductId and same barcode & productId
    const whsProduct = await Product.findOne({ vendorId: wholesaler._id });
    expect(whsProduct).not.toBeNull();
    expect(whsProduct.stock).toBe(100);
    expect(whsProduct.productId).toBe('ZBP-100200');
    expect(whsProduct.barcode).toBe('8901008310247');
    expect(whsProduct.sourceProductId.toString()).toBe(masterProduct._id.toString());

    // StockMovement audit ledger recorded for both OUT and IN
    const outMovement = await StockMovement.findOne({ vendorId: manufacturer._id, movementType: 'OUT' });
    expect(outMovement).not.toBeNull();
    expect(outMovement.movementId).toBeDefined();
    expect(outMovement.previousStock).toBe(500);
    expect(outMovement.newStock).toBe(400);

    const inMovement = await StockMovement.findOne({ vendorId: wholesaler._id, movementType: 'IN' });
    expect(inMovement).not.toBeNull();
    expect(inMovement.movementId).toBeDefined();
    expect(inMovement.previousStock).toBe(0);
    expect(inMovement.newStock).toBe(100);
  });

  // TEST D: Wholesaler -> Distributor Billing & Automatic Transfer
  it('Test D: Wholesaler sells 40 units to Distributor; Wholesaler stock becomes 60, Distributor becomes 40', async () => {
    const { manufacturer, wholesaler, distributor, masterProduct } = await setupFullSupplyChain();

    // First: Transfer 100 units from Mfg to Wholesaler
    const inv1Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: {
          buyerId: wholesaler._id.toString(),
          items: [{ productId: masterProduct._id.toString(), quantity: 100, rate: 10 }],
        },
      },
      inv1Res
    );
    const inv1 = inv1Res.json.mock.calls[0][0].data.invoice;
    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: inv1._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: '123456789012' },
      },
      makeRes()
    );

    const whsProduct = await Product.findOne({ vendorId: wholesaler._id });
    expect(whsProduct.stock).toBe(100);

    // Second: Wholesaler sells 40 units to Distributor
    const inv2Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: wholesaler._id.toString() },
        body: {
          buyerId: distributor._id.toString(),
          items: [{ productId: whsProduct._id.toString(), quantity: 40, rate: 11 }],
        },
      },
      inv2Res
    );
    const inv2 = inv2Res.json.mock.calls[0][0].data.invoice;

    const transferRes = makeRes();
    await verifyAndTransferB2BStock(
      {
        user: { id: wholesaler._id.toString() },
        params: { id: inv2._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: '987654321098' },
      },
      transferRes
    );
    expect(transferRes.status).toHaveBeenCalledWith(200);

    // Wholesaler stock: 100 -> 60
    const updatedWhs = await Product.findById(whsProduct._id);
    expect(updatedWhs.stock).toBe(60);

    // Distributor stock: 0 -> 40, preserving root sourceProductId pointing to Master Product!
    const distProduct = await Product.findOne({ vendorId: distributor._id });
    expect(distProduct).not.toBeNull();
    expect(distProduct.stock).toBe(40);
    expect(distProduct.productId).toBe('ZBP-100200');
    expect(distProduct.barcode).toBe('8901008310247');
    expect(distProduct.sourceProductId.toString()).toBe(masterProduct._id.toString());
  });

  // TEST E: Distributor -> Retailer Billing & Automatic Transfer
  it('Test E: Distributor sells 15 units to Retailer; Distributor stock becomes 25, Retailer becomes 15', async () => {
    const { manufacturer, wholesaler, distributor, retailer, masterProduct } = await setupFullSupplyChain();

    // 1. Mfg -> Wholesaler (100)
    const inv1Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 100, rate: 10 }] },
      },
      inv1Res
    );
    await verifyAndTransferB2BStock(
      { user: { id: manufacturer._id.toString() }, params: { id: inv1Res.json.mock.calls[0][0].data.invoice._id.toString() }, body: { paymentMethod: 'UPI_INTENT', utr: '100000000001' } },
      makeRes()
    );

    // 2. Wholesaler -> Distributor (40)
    const whsProduct = await Product.findOne({ vendorId: wholesaler._id });
    const inv2Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: wholesaler._id.toString() },
        body: { buyerId: distributor._id.toString(), items: [{ productId: whsProduct._id.toString(), quantity: 40, rate: 11 }] },
      },
      inv2Res
    );
    await verifyAndTransferB2BStock(
      { user: { id: wholesaler._id.toString() }, params: { id: inv2Res.json.mock.calls[0][0].data.invoice._id.toString() }, body: { paymentMethod: 'UPI_INTENT', utr: '100000000002' } },
      makeRes()
    );

    // 3. Distributor -> Retailer (15)
    const distProduct = await Product.findOne({ vendorId: distributor._id });
    expect(distProduct.stock).toBe(40);

    const inv3Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: distributor._id.toString() },
        body: { buyerId: retailer._id.toString(), items: [{ productId: distProduct._id.toString(), quantity: 15, rate: 12 }] },
      },
      inv3Res
    );
    const inv3 = inv3Res.json.mock.calls[0][0].data.invoice;

    await verifyAndTransferB2BStock(
      { user: { id: distributor._id.toString() }, params: { id: inv3._id.toString() }, body: { paymentMethod: 'UPI_INTENT', utr: '100000000003' } },
      makeRes()
    );

    // Distributor stock: 40 - 15 = 25
    const updatedDist = await Product.findById(distProduct._id);
    expect(updatedDist.stock).toBe(25);

    // Retailer stock: 15, with root sourceProductId pointing to Master Product!
    const retProduct = await Product.findOne({ vendorId: retailer._id });
    expect(retProduct).not.toBeNull();
    expect(retProduct.stock).toBe(15);
    expect(retProduct.productId).toBe('ZBP-100200');
    expect(retProduct.barcode).toBe('8901008310247');
    expect(retProduct.sourceProductId.toString()).toBe(masterProduct._id.toString());
  });

  // TEST F: Locked Cashback % Across All Tiers
  it('Test F: Manufacturer cashback percentage is preserved in downstream tiers and cannot be altered', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    // Transfer stock to wholesaler
    const invRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 50, rate: 10 }] },
      },
      invRes
    );
    await verifyAndTransferB2BStock(
      { user: { id: manufacturer._id.toString() }, params: { id: invRes.json.mock.calls[0][0].data.invoice._id.toString() }, body: { paymentMethod: 'UPI_INTENT', utr: '200000000001' } },
      makeRes()
    );

    const whsProduct = await Product.findOne({ vendorId: wholesaler._id });
    expect(whsProduct.cashbackPercentage).toBe(5);

    // Wholesaler attempts to modify cashback percentage to 20%
    const updateReq = {
      user: { id: wholesaler._id.toString() },
      params: { id: whsProduct._id.toString() },
      body: { cashbackPercentage: 20 },
    };
    const updateRes = makeRes();
    await updateProduct(updateReq, updateRes);

    // Recheck: cashback percentage must remain locked at 5%
    const recheckProduct = await Product.findById(whsProduct._id);
    expect(recheckProduct.cashbackPercentage).toBe(5);
  });

  // TEST G: Duplicate Callback / UTR Re-submission Idempotency
  it('Test G: Duplicate payment callback is idempotent; duplicate UTR on separate invoice is rejected', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    const inv1Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 50, rate: 10 }] },
      },
      inv1Res
    );
    const invoice1 = inv1Res.json.mock.calls[0][0].data.invoice;

    const transferReq = {
      user: { id: manufacturer._id.toString() },
      params: { id: invoice1._id.toString() },
      body: { paymentMethod: 'UPI_INTENT', utr: '300000000001' },
    };

    // First call: succeeds
    const res1 = makeRes();
    await verifyAndTransferB2BStock(transferReq, res1);
    expect(res1.status).toHaveBeenCalledWith(200);

    // Second call with same invoice: idempotency catch
    const res2 = makeRes();
    await verifyAndTransferB2BStock(transferReq, res2);
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(res2.json.mock.calls[0][0].alreadyTransferred).toBe(true);

    // Manufacturer stock must still be 450 (not deducted twice!)
    const mfgProd = await Product.findById(masterProduct._id);
    expect(mfgProd.stock).toBe(450);

    // New invoice attempting to reuse the same UTR '300000000001'
    const inv2Res = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 10, rate: 10 }] },
      },
      inv2Res
    );
    const invoice2 = inv2Res.json.mock.calls[0][0].data.invoice;

    const res3 = makeRes();
    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: invoice2._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: '300000000001' }, // Reused UTR!
      },
      res3
    );
    expect(res3.status).toHaveBeenCalledWith(400);
    expect(res3.json.mock.calls[0][0].message).toContain('already been used');
  });

  // TEST H: Negative Stock / Overselling Prevention
  it('Test H: Prevents overselling when requested quantity exceeds available stock', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    // Available is 500, attempt to bill 600
    const invRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 600, rate: 10 }] },
      },
      invRes
    );

    expect(invRes.status).toHaveBeenCalledWith(400);
    expect(invRes.json.mock.calls[0][0].message).toContain('Insufficient stock');

    // Stock remains 500
    const checkProduct = await Product.findById(masterProduct._id);
    expect(checkProduct.stock).toBe(500);
  });

  // TEST I: Failed / Unverified Payment Rejection
  it('Test I: Invalid or missing payment reference does not transfer stock', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    const invRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 20, rate: 10 }] },
      },
      invRes
    );
    const invoice = invRes.json.mock.calls[0][0].data.invoice;

    // Bad UTR (less than 12 digits)
    const transferRes = makeRes();
    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: invoice._id.toString() },
        body: { paymentMethod: 'UPI_INTENT', utr: 'INVALID_UTR' },
      },
      transferRes
    );

    expect(transferRes.status).toHaveBeenCalledWith(400);

    // Stock unchanged
    const checkProduct = await Product.findById(masterProduct._id);
    expect(checkProduct.stock).toBe(500);

    const wholesalerProducts = await Product.find({ vendorId: wholesaler._id });
    expect(wholesalerProducts.length).toBe(0);
  });

  // TEST J: Authorized Cash Payment Confirmation
  it('Test J: Explicit authorized cash confirmation transfers stock and logs receipt details', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    const invRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: {
          buyerId: wholesaler._id.toString(),
          items: [{ productId: masterProduct._id.toString(), quantity: 30, rate: 10 }],
          paymentMethod: 'CASH',
        },
      },
      invRes
    );
    const invoice = invRes.json.mock.calls[0][0].data.invoice;

    // Reject if cash confirmation flag is missing
    const unconfirmedRes = makeRes();
    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString() },
        params: { id: invoice._id.toString() },
        body: { paymentMethod: 'CASH', cashConfirmed: false },
      },
      unconfirmedRes
    );
    expect(unconfirmedRes.status).toHaveBeenCalledWith(400);

    // Authorized confirmation
    const confirmedRes = makeRes();
    await verifyAndTransferB2BStock(
      {
        user: { id: manufacturer._id.toString(), storeName: 'Shree Shyam Foods Counter' },
        params: { id: invoice._id.toString() },
        body: {
          paymentMethod: 'CASH',
          cashConfirmed: true,
          confirmedBy: 'Cashier Rajesh',
          notes: 'Full payment received in INR currency notes at wholesale counter',
        },
      },
      confirmedRes
    );

    expect(confirmedRes.status).toHaveBeenCalledWith(200);

    // Verify stock movement
    const mfgProd = await Product.findById(masterProduct._id);
    expect(mfgProd.stock).toBe(470); // 500 - 30

    const whsProd = await Product.findOne({ vendorId: wholesaler._id });
    expect(whsProd.stock).toBe(30);

    // Verify invoice cashDetails recorded
    const updatedInvoice = await B2BInvoice.findById(invoice._id);
    expect(updatedInvoice.paymentStatus).toBe('PAID');
    expect(updatedInvoice.paymentMethod).toBe('CASH');
    expect(updatedInvoice.cashDetails.receivedBy).toBe('Cashier Rajesh');
    expect(updatedInvoice.cashDetails.confirmedAt).toBeDefined();
    expect(updatedInvoice.cashDetails.notes).toContain('Full payment received');
  });

  // Admin Ecosystem Endpoints Test
  it('Admin Supply Chain APIs: in-depth ledger, invoice listing, and circulation ownership', async () => {
    const { manufacturer, wholesaler, masterProduct } = await setupFullSupplyChain();

    // Perform a sale
    const invRes = makeRes();
    await createB2BInvoice(
      {
        user: { id: manufacturer._id.toString() },
        body: { buyerId: wholesaler._id.toString(), items: [{ productId: masterProduct._id.toString(), quantity: 80, rate: 10 }] },
      },
      invRes
    );
    const invoice = invRes.json.mock.calls[0][0].data.invoice;
    await verifyAndTransferB2BStock(
      { user: { id: manufacturer._id.toString() }, params: { id: invoice._id.toString() }, body: { paymentMethod: 'UPI_INTENT', utr: '778899001122' } },
      makeRes()
    );

    // 1. Admin Invoices
    const adminInvRes = makeRes();
    await getAdminB2BInvoices({ query: {} }, adminInvRes);
    expect(adminInvRes.status).toHaveBeenCalledWith(200);
    const adminInvBody = adminInvRes.json.mock.calls[0][0];
    expect(adminInvBody.data.length).toBeGreaterThanOrEqual(1);

    // 2. Admin Stock Ledger
    const adminLedgerRes = makeRes();
    await getAdminStockLedger({ query: {} }, adminLedgerRes);
    expect(adminLedgerRes.status).toHaveBeenCalledWith(200);
    const adminLedgerBody = adminLedgerRes.json.mock.calls[0][0];
    expect(adminLedgerBody.data.length).toBeGreaterThanOrEqual(2); // 1 OUT, 1 IN

    // 3. Admin Supply Chain Circulation
    const adminCatRes = makeRes();
    await getAdminSupplyChainCatalogue({ query: {} }, adminCatRes);
    expect(adminCatRes.status).toHaveBeenCalledWith(200);
    const adminCatBody = adminCatRes.json.mock.calls[0][0];
    expect(adminCatBody.data.length).toBeGreaterThanOrEqual(1);
    const maggiMaster = adminCatBody.data.find((item) => item.productId === 'ZBP-100200');
    expect(maggiMaster).toBeDefined();
    expect(maggiMaster.totalStockInCirculation).toBe(500); // 420 at manufacturer + 80 at wholesaler
    expect(maggiMaster.downstreamHoldersCount).toBe(1);
  });
});
