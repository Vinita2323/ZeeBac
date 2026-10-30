import express from 'express';
import { protect, requireRole } from '../middlewares/auth.middleware.js';
import {
  searchB2BProducts,
  searchB2BBuyers,
  createB2BInvoice,
  verifyAndTransferB2BStock,
  getSellerInvoices,
  getBuyerInvoices,
  getB2BInvoiceById,
  getStockLedger,
  getManufacturerDashboardStats,
  getAdminB2BInvoices,
  getAdminStockLedger,
  getAdminSupplyChainCatalogue,
} from '../controllers/b2b.controller.js';

const router = express.Router();

// All B2B routes require authenticated user
router.use(protect);
router.use(requireRole('vendor', 'admin', 'super_admin'));

// Barcode & Product search for cashier billing & master catalogue
router.get('/products/search', searchB2BProducts);

// Wholesaler, Distributor & Buyer lookup
router.get('/buyers/search', searchB2BBuyers);

// Dashboard overview
router.get('/dashboard-stats', getManufacturerDashboardStats);

// Invoices
router.post('/invoices', createB2BInvoice);
router.post('/invoices/:id/verify-and-transfer', verifyAndTransferB2BStock);
router.get('/invoices/seller', getSellerInvoices);
router.get('/invoices/buyer', getBuyerInvoices);
router.get('/invoices/:id', getB2BInvoiceById);

// Stock audit ledger
router.get('/stock-ledger', getStockLedger);

// Admin Supply Chain Oversight
router.get('/admin/invoices', requireRole('admin', 'super_admin'), getAdminB2BInvoices);
router.get('/admin/stock-ledger', requireRole('admin', 'super_admin'), getAdminStockLedger);
router.get('/admin/catalogue-ownership', requireRole('admin', 'super_admin'), getAdminSupplyChainCatalogue);

export default router;
