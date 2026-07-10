import SupportTicket from '../models/SupportTicket.js';
import logger from '../utils/logger.js';
import { notifyAdmins } from '../utils/adminNotification.js';

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
      subject,
      message
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
    const { status } = req.query;
    let query = {};
    if (status && status !== 'All') {
      query.status = status;
    }
    
    // Using populate with refPath to get either User or Vendor details
    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name storeName email')
      .sort({ createdAt: -1 });
      
    res.status(200).json({ success: true, data: tickets });
  } catch (error) {
    logger.error(`getAllTickets error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const replyToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { replyMessage } = req.body;
    
    if (!replyMessage) {
      return res.status(400).json({ success: false, message: 'Reply message is required' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    ticket.adminReply = replyMessage;
    ticket.status = 'Resolved';
    ticket.repliedAt = Date.now();
    await ticket.save();

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
