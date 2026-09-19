import SupportTicket from '../models/SupportTicket.js';
import '../models/User.js';
import '../models/Vendor.js';
import logger from '../utils/logger.js';
import { notifyAdmins } from '../utils/adminNotification.js';
import { sendNotification } from '../services/notification.service.js';

// --- User Actions ---
export const createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    const ticket = await SupportTicket.create({
      userId: req.user.id,
      userType: req.user.role === 'vendor' ? 'Vendor' : 'User',
      subject: subject.trim(),
      message: message.trim()
    });

    await notifyAdmins('SUPPORT_TICKET', 'New Support Ticket', `${req.user.role === 'vendor' ? 'Vendor' : 'User'} opened a ticket: ${subject}`);

    res.status(201).json({ success: true, data: ticket, message: 'Support ticket submitted successfully' });
  } catch (error) {
    logger.error(`createTicket error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getUserTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: tickets });
  } catch (error) {
    logger.error(`getUserTickets error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// --- Admin Actions ---
export const getAllTickets = async (req, res) => {
  try {
    const { status, userType, search } = req.query;
    let query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (userType && userType !== 'All') {
      query.userType = userType;
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { subject: { $regex: term, $options: 'i' } },
        { message: { $regex: term, $options: 'i' } }
      ];
    }
    
    // Using populate with refPath to get either User or Vendor details
    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name storeName ownerName email phone zeebacId profileImage profilePic')
      .sort({ createdAt: -1 });

    // Filter by user fields in memory if search was provided and didn't match subject/message
    let filteredTickets = tickets;
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      filteredTickets = tickets.filter(t => {
        const u = t.userId || {};
        const subjectMatch = t.subject?.toLowerCase().includes(term);
        const messageMatch = t.message?.toLowerCase().includes(term);
        const nameMatch = (u.name || u.storeName || u.ownerName || '').toLowerCase().includes(term);
        const phoneMatch = (u.phone || '').toLowerCase().includes(term);
        const zeebacIdMatch = (u.zeebacId || '').toLowerCase().includes(term);
        return subjectMatch || messageMatch || nameMatch || phoneMatch || zeebacIdMatch;
      });
    }

    // Return status counts for quick admin statistics
    const counts = {
      all: await SupportTicket.countDocuments(),
      open: await SupportTicket.countDocuments({ status: 'Open' }),
      inProgress: await SupportTicket.countDocuments({ status: 'In Progress' }),
      resolved: await SupportTicket.countDocuments({ status: 'Resolved' }),
      closed: await SupportTicket.countDocuments({ status: 'Closed' }),
    };
      
    res.status(200).json({ success: true, data: filteredTickets, counts });
  } catch (error) {
    logger.error(`getAllTickets error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const replyToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { replyMessage, status = 'Resolved' } = req.body;
    
    if (!replyMessage) {
      return res.status(400).json({ success: false, message: 'Reply message is required' });
    }

    const ticket = await SupportTicket.findById(id).populate('userId', 'name storeName email phone fcmTokens');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    ticket.adminReply = replyMessage;
    ticket.status = status;
    ticket.repliedAt = Date.now();
    await ticket.save();

    // Send real-time notification to user/vendor
    try {
      await sendNotification({
        recipientId: ticket.userId?._id || ticket.userId,
        recipientType: ticket.userType === 'Vendor' ? 'vendor' : 'user',
        type: 'system',
        title: 'Support Ticket Update',
        message: `Admin replied to your ticket "${ticket.subject}": ${replyMessage}`,
        icon: 'support_agent'
      });
    } catch (notifErr) {
      logger.warn(`Failed to dispatch reply notification: ${notifErr.message}`);
    }

    res.status(200).json({ success: true, data: ticket, message: 'Reply sent successfully' });
  } catch (error) {
    logger.error(`replyToTicket error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const closeTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    ticket.status = 'Closed';
    await ticket.save();

    res.status(200).json({ success: true, data: ticket, message: 'Ticket closed' });
  } catch (error) {
    logger.error(`closeTicket error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Dynamic FAQ Management (Customer, Vendor, & Admin) ───

import Faq from '../models/Faq.js';

const DEFAULT_FAQS = [
  // Customer FAQs
  {
    question: "How does Zeebac Cashback audit work?",
    answer: "When you upload a bill receipt, it is sent to the respective partner merchant for verification. Once audited (usually in 2-4 hours), the calculated cashback reward is instantly credited to your Zeebac Wallet balance.",
    category: "Cashback",
    target: "customer",
    order: 1,
    isActive: true,
  },
  {
    question: "When can I cash out my rewards?",
    answer: "You can cash out your reward balance directly to your linked bank account or UPI ID. Go to Wallet -> Cashout, choose your transfer method, and verify with your biometric or PIN. Deposits typically take 5-10 minutes.",
    category: "Wallet",
    target: "customer",
    order: 2,
    isActive: true,
  },
  {
    question: "Why was my cashback request rejected?",
    answer: "Rejections generally happen if: (1) The receipt is blurry or unreadable, (2) The payment method does not match, (3) The invoice has already been claimed. You can resubmit requests with better images directly.",
    category: "Cashback",
    target: "customer",
    order: 3,
    isActive: true,
  },
  {
    question: "What is the maximum cashback rate?",
    answer: "Each merchant has a specific cashback rate (e.g. up to 15% at partner stores). You can review all current partner stores, their rates, and distance under the 'Explore' tab.",
    category: "General",
    target: "customer",
    order: 4,
    isActive: true,
  },
  {
    question: "How do I secure my wallet transactions?",
    answer: "You can enable a 4-8 digit Security PIN and device biometrics (Fingerprint/Face ID) under your Profile -> Security Settings. This prevents unauthorized payments or withdrawals.",
    category: "Security",
    target: "customer",
    order: 5,
    isActive: true,
  },
  // Vendor FAQs
  {
    question: "How are cashback payouts settled?",
    answer: "Cashback amounts given to users are deducted from your Vendor Wallet. You must maintain sufficient float balance to approve cashback requests.",
    category: "Wallet",
    target: "vendor",
    order: 1,
    isActive: true,
  },
  {
    question: "How can I withdraw my wallet balance?",
    answer: "You can request a withdrawal to your linked bank account from the Wallet section. Withdrawals are processed within 24-48 hours.",
    category: "Wallet",
    target: "vendor",
    order: 2,
    isActive: true,
  },
  {
    question: "How to update my store location and details?",
    answer: "You can update your store location, operating hours, and description directly from the Profile page.",
    category: "Account",
    target: "vendor",
    order: 3,
    isActive: true,
  },
  {
    question: "How does vendor subscription work?",
    answer: "Vendors can purchase Monthly, 3-Month, or Annual subscription plans using wallet balance or UPI. Active subscriptions keep your store visible in customer search and explore lists.",
    category: "Subscription",
    target: "vendor",
    order: 4,
    isActive: true,
  },
];

// Helper to auto-seed default FAQs on first access
const seedFaqsIfEmpty = async () => {
  try {
    const count = await Faq.countDocuments();
    if (count === 0) {
      await Faq.insertMany(DEFAULT_FAQS);
      logger.info('Auto-seeded default FAQs successfully');
    }
  } catch (err) {
    logger.warn(`Failed to auto-seed FAQs: ${err.message}`);
  }
};

// 1. Public / User / Vendor FAQ list
export const getPublicFaqs = async (req, res) => {
  try {
    await seedFaqsIfEmpty();

    const { target, category, search } = req.query;
    const query = { isActive: true };

    if (target && target !== 'all') {
      query.target = { $in: [target, 'all'] };
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { question: { $regex: term, $options: 'i' } },
        { answer: { $regex: term, $options: 'i' } }
      ];
    }

    const faqs = await Faq.find(query).sort({ order: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: faqs });
  } catch (error) {
    logger.error(`getPublicFaqs error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 2. Admin: Get all FAQs (including inactive) with counts and filters
export const getAllAdminFaqs = async (req, res) => {
  try {
    await seedFaqsIfEmpty();

    const { target, category, status, search } = req.query;
    const query = {};

    if (target && target !== 'all') {
      query.target = target;
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { question: { $regex: term, $options: 'i' } },
        { answer: { $regex: term, $options: 'i' } }
      ];
    }

    const faqs = await Faq.find(query).sort({ order: 1, createdAt: -1 });

    const counts = {
      total: await Faq.countDocuments(),
      customer: await Faq.countDocuments({ target: 'customer' }),
      vendor: await Faq.countDocuments({ target: 'vendor' }),
      allAudience: await Faq.countDocuments({ target: 'all' }),
      active: await Faq.countDocuments({ isActive: true }),
      inactive: await Faq.countDocuments({ isActive: false }),
    };

    res.status(200).json({ success: true, data: faqs, counts });
  } catch (error) {
    logger.error(`getAllAdminFaqs error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 3. Admin: Create a new FAQ
export const createFaq = async (req, res) => {
  try {
    const { question, answer, category = 'General', target = 'all', order = 0, isActive = true } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, message: 'Question and answer are required' });
    }

    const faq = await Faq.create({
      question: question.trim(),
      answer: answer.trim(),
      category,
      target,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
      createdBy: req.user?.id,
    });

    res.status(201).json({ success: true, data: faq, message: 'FAQ created successfully' });
  } catch (error) {
    logger.error(`createFaq error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// 4. Admin: Update an existing FAQ
export const updateFaq = async (req, res) => {
  try {
    const { question, answer, category, target, order, isActive } = req.body;
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }

    if (question !== undefined) faq.question = question.trim();
    if (answer !== undefined) faq.answer = answer.trim();
    if (category !== undefined) faq.category = category;
    if (target !== undefined) faq.target = target;
    if (order !== undefined) faq.order = Number(order);
    if (isActive !== undefined) faq.isActive = Boolean(isActive);

    await faq.save();
    res.status(200).json({ success: true, data: faq, message: 'FAQ updated successfully' });
  } catch (error) {
    logger.error(`updateFaq error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// 5. Admin: Delete an FAQ
export const deleteFaq = async (req, res) => {
  try {
    const faq = await Faq.findByIdAndDelete(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    res.status(200).json({ success: true, message: 'FAQ deleted successfully' });
  } catch (error) {
    logger.error(`deleteFaq error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 6. Admin: Toggle FAQ active status
export const toggleFaqStatus = async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }

    faq.isActive = !faq.isActive;
    await faq.save();

    res.status(200).json({
      success: true,
      data: faq,
      message: `FAQ marked ${faq.isActive ? 'Active' : 'Inactive'}`,
    });
  } catch (error) {
    logger.error(`toggleFaqStatus error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
