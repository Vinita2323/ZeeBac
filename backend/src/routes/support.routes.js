import express from 'express';
import { createTicket, getUserTickets } from '../controllers/support.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect); // Need to be logged in to create or view tickets

router.post('/', createTicket);
router.get('/', getUserTickets);

export default router;
