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
} from '../controllers/b2b.controller.js';

const router = express.Router();

// All B2B routes require authenticated vendor
router.use(protect);
router.use(requireRole('vendor', 'admin', 'super_admin'));

// Barcode & Product search for cashier billing
router.get('/products/search', searchB2BProducts);

// Wholesaler & Buyer lookup
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

export default router;
