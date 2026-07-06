import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// Get all conversations for the logged-in user (Customer or Vendor)
export const getMyConversations = async (req, res) => {
  try {
    const isVendor = req.user.role === 'vendor';
    const query = isVendor ? { vendorId: req.user.id } : { customerId: req.user.id };

    const conversations = await Conversation.find(query)
      .populate('customerId', 'name profileImage')
      .populate('vendorId', 'storeName profilePic')
      .sort({ lastMessageAt: -1 });

    res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    logger.error(`getMyConversations error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create a new conversation or get existing one
export const getOrCreateConversation = async (req, res) => {
  try {
    const isVendor = req.user.role === 'vendor';
    let { vendorId, customerId } = req.body;

    if (isVendor) {
      vendorId = req.user.id;
    } else {
      customerId = req.user.id;
    }

    if (!vendorId || !customerId) {
      return res.status(400).json({ success: false, message: 'VendorId and CustomerId are required' });
    }

    let conversation = await Conversation.findOne({ vendorId, customerId })
      .populate('customerId', 'name profileImage')
      .populate('vendorId', 'storeName profilePic');

    if (!conversation) {
      conversation = await Conversation.create({ vendorId, customerId });
      conversation = await Conversation.findById(conversation._id)
        .populate('customerId', 'name profileImage')
        .populate('vendorId', 'storeName profilePic');
    }

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    logger.error(`getOrCreateConversation error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get messages for a specific conversation
export const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Authorization check
    if (
      conversation.customerId.toString() !== req.user.id &&
      conversation.vendorId.toString() !== req.user.id
    ) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to conversation' });
    }

    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Reset unread count
    const isVendor = req.user.role === 'vendor';
    if (isVendor && conversation.unreadByVendor > 0) {
      conversation.unreadByVendor = 0;
      await conversation.save();
    } else if (!isVendor && conversation.unreadByCustomer > 0) {
      conversation.unreadByCustomer = 0;
      await conversation.save();
    }

    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    logger.error(`getMessages error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Upload an image for chat
export const uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    
    // In production, you would upload to S3 here.
    // For local dev, return the static file path.
    const fileUrl = `/${req.file.path.replace(/\\/g, '/')}`;
    
    res.status(200).json({ 
      success: true, 
      data: {
        url: fileUrl,
        fileName: req.file.filename
      } 
    });
  } catch (error) {
    logger.error(`uploadChatImage error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error during upload' });
  }
};
