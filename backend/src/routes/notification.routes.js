import express from 'express';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
} from '../controllers/notification.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Get all notifications for logged-in user/vendor
router.get('/', getMyNotifications);

// Get unread count (for bell badge)
router.get('/unread-count', getUnreadCount);

// Mark single notification as read
router.patch('/:id/read', markAsRead);

// Mark all as read
router.patch('/read-all', markAllRead);

export default router;
