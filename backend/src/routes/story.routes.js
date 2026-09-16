import express from 'express';
import {
  createStory,
  getActiveStories,
  getVendorStories,
  getMyStories,
  getStoryViewers,
  recordStoryView,
  deleteStory,
} from '../controllers/story.controller.js';
import { protect, requireRole, optionalAuth } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

// Public / User routes
router.get('/active', optionalAuth, getActiveStories);
router.get('/vendor/:vendorId', optionalAuth, getVendorStories);
router.post('/:id/view', optionalAuth, recordStoryView);

// Vendor Protected routes
router.post('/', protect, requireRole('vendor'), upload.single('storyMedia'), createStory);
router.get('/my', protect, requireRole('vendor'), getMyStories);
router.get('/:id/viewers', protect, requireRole('vendor'), getStoryViewers);
router.delete('/:id', protect, requireRole('vendor'), deleteStory);

export default router;
