import express from 'express';
import { createTicket, getUserTickets, getPublicFaqs, getSupportConfig } from '../controllers/support.controller.js';
import { protect, optionalAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public / User FAQs & Support Contact Config
router.get('/faqs', optionalAuth, getPublicFaqs);
router.get('/config', optionalAuth, getSupportConfig);

// Protected Ticket Routes
router.post('/', protect, createTicket);
router.get('/', protect, getUserTickets);

export default router;

