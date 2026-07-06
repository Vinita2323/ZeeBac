import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import logger from '../utils/logger.js';

export default function registerChatHandlers(io, socket) {
  // Join a specific conversation room
  socket.on('joinRoom', (conversationId) => {
    socket.join(conversationId);
    logger.info(`User ${socket.user.id} joined room: ${conversationId}`);
  });

  // Leave a room
  socket.on('leaveRoom', (conversationId) => {
    socket.leave(conversationId);
    logger.info(`User ${socket.user.id} left room: ${conversationId}`);
  });

  // Handle new message
  socket.on('sendMessage', async (data, callback) => {
    try {
      const { conversationId, text, attachments } = data;
      const isVendor = socket.user.role === 'vendor';

      // 1. Save message to DB
      const newMessage = await Message.create({
        conversationId,
        sender: isVendor ? 'vendor' : 'customer',
        senderId: socket.user.id,
        text,
        attachments: attachments || [],
      });

      // 2. Update conversation's last message and unread count
      const updateData = {
        lastMessage: text,
        lastMessageAt: Date.now(),
        lastMessageBy: isVendor ? 'vendor' : 'customer',
      };

      if (isVendor) {
        updateData.$inc = { unreadByCustomer: 1 };
      } else {
        updateData.$inc = { unreadByVendor: 1 };
      }

      await Conversation.findByIdAndUpdate(conversationId, updateData);

      // 3. Emit message to the room
      io.to(conversationId).emit('newMessage', newMessage);

      // Notify the sender that it was successful
      if (typeof callback === 'function') {
        callback({ success: true, data: newMessage });
      }
    } catch (error) {
      logger.error(`sendMessage error: ${error.message}`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Failed to send message' });
      }
    }
  });

  // Mark conversation as read
  socket.on('markAsRead', async (conversationId) => {
    try {
      const isVendor = socket.user.role === 'vendor';

      if (isVendor) {
        await Conversation.findByIdAndUpdate(conversationId, { unreadByVendor: 0 });
      } else {
        await Conversation.findByIdAndUpdate(conversationId, { unreadByCustomer: 0 });
      }

      // We can also mark specific messages as read if needed, but for now just update the conversation level
      logger.info(`User ${socket.user.id} marked conversation ${conversationId} as read`);
    } catch (error) {
      logger.error(`markAsRead error: ${error.message}`);
    }
  });
}
