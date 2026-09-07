import express from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// Razorpay Webhook Endpoint
// Expects raw body for HMAC SHA-256 signature verification
router.post('/razorpay', handleRazorpayWebhook);

export default router;
