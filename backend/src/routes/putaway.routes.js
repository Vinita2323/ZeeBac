import express from 'express';
import { protect, requireRole, requireApprovedVendor } from '../middlewares/auth.middleware.js';
import {
  getPutawayTasks,
  scanPutawayItem,
  verifyPutawayBin,
  confirmPutaway,
  createPutawayTask,
  getDarkStoreBins,
  getAdminPutawayTelemetry,
} from '../controllers/putaway.controller.js';

const router = express.Router();

// ── Vendor Putaway Operations (Requires login & approved vendor) ──
router.get('/tasks', protect, requireRole('vendor'), requireApprovedVendor, getPutawayTasks);
router.post('/scan-item', protect, requireRole('vendor'), requireApprovedVendor, scanPutawayItem);
router.post('/verify-bin', protect, requireRole('vendor'), requireApprovedVendor, verifyPutawayBin);
router.post('/confirm', protect, requireRole('vendor'), requireApprovedVendor, confirmPutaway);
router.post('/tasks', protect, requireRole('vendor'), requireApprovedVendor, createPutawayTask);
router.get('/bins', protect, requireRole('vendor'), requireApprovedVendor, getDarkStoreBins);

// ── Admin Telemetry Operations ──
router.get('/admin/telemetry', protect, requireRole('admin'), getAdminPutawayTelemetry);

export default router;
