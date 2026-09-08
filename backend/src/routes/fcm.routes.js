import express from 'express';
import { saveMobileFcmToken } from '../controllers/notification.controller.js';

const router = express.Router();

// Support both /mobile/save, /save, and /
router.post('/mobile/save', saveMobileFcmToken);
router.post('/save', saveMobileFcmToken);
router.post('/', saveMobileFcmToken);

export default router;
