import express from 'express';
import { saveMobileFcmToken } from '../controllers/notification.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Login required: the token is always saved on the LOGGED-IN account (never a userId from the body),
// otherwise anyone could attach their phone to another person's account and read their notifications.
router.post('/mobile/save', protect, saveMobileFcmToken);
router.post('/save', protect, saveMobileFcmToken);
router.post('/', protect, saveMobileFcmToken);

// Friendly info for GET requests (e.g. testing in browser)
const getInfoHandler = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'FCM Token endpoint is active. Please send a POST request with JSON body { token, role, userId }',
  });
};
router.get('/mobile/save', getInfoHandler);
router.get('/save', getInfoHandler);
router.get('/', getInfoHandler);

export default router;
