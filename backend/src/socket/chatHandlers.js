import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import logger from '../utils/logger.js';
import { sendNotification } from '../services/notification.service.js';

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
        lastMessageIsRead: false,
      };

      if (isVendor) {
        updateData.$inc = { unreadByCustomer: 1 };
      } else {
        updateData.$inc = { unreadByVendor: 1 };
      }

      const updatedConv = await Conversation.findByIdAndUpdate(conversationId, updateData, { new: true });

      // 3. Emit message to the room
      io.to(conversationId).emit('newMessage', newMessage);

      // 4. Notify recipient's personal room about conversation update for instant unread badge in chat list
      if (updatedConv) {
        const recipientRoom = isVendor ? `user_${updatedConv.customerId}` : `vendor_${updatedConv.vendorId}`;
        const recipientType = isVendor ? 'customer' : 'vendor';

        io.to(recipientRoom).emit('conversationUpdated', {
          conversationId,
          lastMessage: text,
          lastMessageAt: updateData.lastMessageAt,
          lastMessageBy: updateData.lastMessageBy,
          unreadByCustomer: updatedConv.unreadByCustomer,
          unreadByVendor: updatedConv.unreadByVendor,
          lastMessageIsRead: false,
        });

        // Emit incomingChatMessage for instant notification / chime on recipient app
        io.to(recipientRoom).emit('incomingChatMessage', {
          conversationId,
          text,
          senderRole: isVendor ? 'vendor' : 'customer',
          senderId: socket.user.id,
        });

        // Send in-app and push notification so recipient sees it in notifications screen and push banner
        try {
          const convDoc = await Conversation.findById(conversationId)
            .populate('vendorId', 'storeName ownerName fcmTokens')
            .populate('customerId', 'name phone fcmTokens');

          if (convDoc) {
            const senderName = isVendor
              ? (convDoc.vendorId?.storeName || 'Merchant')
              : (convDoc.customerId?.name || 'Customer');
            const target = isVendor ? convDoc.customerId : convDoc.vendorId;

            if (target) {
              sendNotification({
                recipientId: target._id,
                recipientType,
                fcmTokens: target.fcmTokens || [],
                type: 'system',
                title: `💬 ${senderName}`,
                message: text ? (text.length > 80 ? text.slice(0, 80) + '...' : text) : 'Sent an attachment',
                icon: 'chat',
                referenceId: conversationId,
                referenceType: 'conversation',
                data: {
                  conversationId: String(conversationId),
                  isChat: 'true',
                },
              }).catch(() => {});
            }
          }
        } catch (notifErr) {
          logger.warn(`Failed to send chat push notification: ${notifErr.message}`);
        }
      }

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
      const readAt = new Date();

      // lastMessageIsRead means "the RECIPIENT of the last message has seen
      // it" — this caller only counts as that recipient if the last message
      // was sent by the OTHER role. Otherwise this is just someone
      // re-opening a thread where they sent the last message themselves,
      // which must not flip on a blue "seen" tick the other side never
      // earned.
      const conversation = await Conversation.findById(conversationId).select('lastMessageBy');
      const recipientOfLastMessage = isVendor ? 'customer' : 'vendor';
      const sawTheirOwnLastMessage = conversation?.lastMessageBy === recipientOfLastMessage;

      if (isVendor) {
        await Conversation.findByIdAndUpdate(conversationId, {
          unreadByVendor: 0,
          ...(sawTheirOwnLastMessage ? { lastMessageIsRead: true } : {}),
        });
      } else {
        await Conversation.findByIdAndUpdate(conversationId, {
          unreadByCustomer: 0,
          ...(sawTheirOwnLastMessage ? { lastMessageIsRead: true } : {}),
        });
      }

      // Mark all unread messages from the other user in this conversation as read
      const senderToMark = isVendor ? 'customer' : 'vendor';
      await Message.updateMany(
        { conversationId, sender: senderToMark, isRead: false },
        { isRead: true, readAt }
      );

      // Broadcast to room so sender instantly sees double blue ticks in real-time
      io.to(conversationId).emit('messagesSeen', {
        conversationId,
        seenBy: socket.user.role,
        readAt,
      });

      logger.info(`User ${socket.user.id} (${socket.user.role}) marked conversation ${conversationId} as read at ${readAt}`);
    } catch (error) {
      logger.error(`markAsRead error: ${error.message}`);
    }
  });
}

