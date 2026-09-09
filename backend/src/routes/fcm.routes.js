import express from 'express';
import { saveMobileFcmToken } from '../controllers/notification.controller.js';

const router = express.Router();

// Support both /mobile/save, /save, and /
router.post('/mobile/save', saveMobileFcmToken);
router.post('/save', saveMobileFcmToken);
router.post('/', saveMobileFcmToken);

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
