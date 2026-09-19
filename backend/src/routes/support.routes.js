import express from 'express';
import { createTicket, getUserTickets, getPublicFaqs } from '../controllers/support.controller.js';
import { protect, optionalAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public / User FAQs
router.get('/faqs', optionalAuth, getPublicFaqs);

// Protected Ticket Routes
router.post('/', protect, createTicket);
router.get('/', protect, getUserTickets);

export default router;
