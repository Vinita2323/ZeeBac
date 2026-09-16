import logger from '../utils/logger.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';

// In-memory active calls: callId -> call data
const activeCalls = new Map();

function findCallByUser(userId) {
  const uid = String(userId);
  for (const call of activeCalls.values()) {
    if (String(call.callerId) === uid || String(call.targetUserId) === uid) {
      return call;
    }
  }
  return null;
}

// Format duration helper (e.g. 01:24)
function formatDurationText(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Record call log message directly into chat database & emit real-time message
async function recordCallMessage(io, call, callResult, durationSeconds = 0) {
  try {
    if (!call || !call.conversationId) return;

    let text = '';
    if (callResult === 'completed') {
      text = `📞 Voice Call (${formatDurationText(durationSeconds)})`;
    } else if (callResult === 'declined') {
      text = `📞 Declined Voice Call`;
    } else if (callResult === 'missed') {
      text = `📞 Missed Voice Call`;
    } else {
      text = `📞 Voice Call Ended`;
    }

    const isCallerVendor = call.callerRole === 'vendor';

    // 1. Create message in DB
    const newMessage = await Message.create({
      conversationId: call.conversationId,
      sender: isCallerVendor ? 'vendor' : 'customer',
      senderId: call.callerId,
      text,
      attachments: [],
    });

    // 2. Update conversation's last message
    const updateData = {
      lastMessage: text,
      lastMessageAt: Date.now(),
      lastMessageBy: isCallerVendor ? 'vendor' : 'customer',
      lastMessageIsRead: false,
    };

    if (isCallerVendor) {
      updateData.$inc = { unreadByCustomer: 1 };
    } else {
      updateData.$inc = { unreadByVendor: 1 };
    }

    const updatedConv = await Conversation.findByIdAndUpdate(call.conversationId, updateData, { new: true });

    // 3. Broadcast new message to the conversation room
    io.to(String(call.conversationId)).emit('newMessage', newMessage);

    // 4. Broadcast conversation update to caller and recipient private rooms
    const convPayload = {
      conversationId: call.conversationId,
      lastMessage: text,
      lastMessageAt: updateData.lastMessageAt,
      lastMessageBy: updateData.lastMessageBy,
      unreadByCustomer: updatedConv?.unreadByCustomer || 0,
      unreadByVendor: updatedConv?.unreadByVendor || 0,
      lastMessageIsRead: false,
    };

    io.to(`user_${call.callerId}`).emit('conversationUpdated', convPayload);
    io.to(`vendor_${call.callerId}`).emit('conversationUpdated', convPayload);
    io.to(`user_${call.targetUserId}`).emit('conversationUpdated', convPayload);
    io.to(`vendor_${call.targetUserId}`).emit('conversationUpdated', convPayload);

    logger.info(`Recorded call message in conversation ${call.conversationId}: ${text}`);
  } catch (err) {
    logger.error(`recordCallMessage error: ${err.message}`);
  }
}

export default function registerCallHandlers(io, socket) {
  const currentUserId = String(socket.user?.id || '');
  const currentUserRole = socket.user?.role || 'customer';

  // 1. Initiate an outgoing call
  socket.on('call:initiate', (data) => {
    try {
      const { targetUserId, targetUserRole, conversationId, offer, callerInfo } = data;

      if (!targetUserId) {
        return socket.emit('call:error', { message: 'Target user ID is required' });
      }

      const targetIdStr = String(targetUserId);
      const userRoom = io.sockets.adapter.rooms.get(`user_${targetIdStr}`);
      const vendorRoom = io.sockets.adapter.rooms.get(`vendor_${targetIdStr}`);
      const hasOnlineSockets = (userRoom && userRoom.size > 0) || (vendorRoom && vendorRoom.size > 0);

      if (!hasOnlineSockets) {
        logger.info(`Call initiation failed: Target ${targetIdStr} is offline`);
        socket.emit('call:unavailable', { message: 'Recipient is currently offline' });
        // Record missed call log
        recordCallMessage(io, {
          conversationId,
          callerId: currentUserId,
          callerRole: currentUserRole,
          targetUserId: targetIdStr,
        }, 'missed', 0);
        return;
      }

      const callId = data.callId || `${currentUserId}_${targetIdStr}_${Date.now()}`;
      activeCalls.set(callId, {
        callId,
        callerId: currentUserId,
        callerRole: currentUserRole,
        targetUserId: targetIdStr,
        targetUserRole: targetUserRole || (currentUserRole === 'vendor' ? 'customer' : 'vendor'),
        conversationId,
        startTime: null,
        status: 'calling',
        createdAt: Date.now(),
      });

      logger.info(`Call initiated [${callId}]: ${currentUserId} calling ${targetIdStr}`);

      // Emit incoming call to both user and vendor rooms of recipient
      const incomingPayload = {
        callId,
        conversationId,
        callerId: currentUserId,
        callerRole: currentUserRole,
        callerInfo: {
          name: callerInfo?.name || 'Zeebac User',
          avatar: callerInfo?.avatar || null,
          role: callerInfo?.role || (currentUserRole === 'vendor' ? 'Partner Store' : 'Customer'),
        },
        offer,
      };

      io.to(`user_${targetIdStr}`).emit('call:incoming', incomingPayload);
      io.to(`vendor_${targetIdStr}`).emit('call:incoming', incomingPayload);
    } catch (error) {
      logger.error(`call:initiate error: ${error.message}`);
      socket.emit('call:error', { message: 'Failed to initiate call' });
    }
  });

  // 2. Answer incoming call
  socket.on('call:answer', (data) => {
    try {
      const { callId, callerId, answer } = data;
      const call = (callId && activeCalls.get(callId)) || findCallByUser(currentUserId);

      if (call) {
        call.startTime = Date.now();
        call.status = 'connected';
      }

      const callerIdStr = String(callerId || call?.callerId || '');
      logger.info(`Call answered [${callId || call?.callId}] by ${currentUserId}`);

      io.to(`user_${callerIdStr}`).emit('call:answered', {
        callId: callId || call?.callId,
        recipientId: currentUserId,
        answer,
      });
      io.to(`vendor_${callerIdStr}`).emit('call:answered', {
        callId: callId || call?.callId,
        recipientId: currentUserId,
        answer,
      });
    } catch (error) {
      logger.error(`call:answer error: ${error.message}`);
    }
  });

  // 3. Reject incoming call
  socket.on('call:reject', async (data) => {
    try {
      const { callId, callerId, reason } = data;
      const call = (callId && activeCalls.get(callId)) || findCallByUser(currentUserId);

      const callerIdStr = String(callerId || call?.callerId || '');
      logger.info(`Call rejected [${callId || call?.callId}] by ${currentUserId} - reason: ${reason || 'declined'}`);

      // Notify caller
      io.to(`user_${callerIdStr}`).emit('call:rejected', {
        callId: callId || call?.callId,
        reason: reason || 'declined',
      });
      io.to(`vendor_${callerIdStr}`).emit('call:rejected', {
        callId: callId || call?.callId,
        reason: reason || 'declined',
      });

      // Record declined call in chat
      if (call) {
        await recordCallMessage(io, call, 'declined', 0);
        activeCalls.delete(call.callId);
      }
    } catch (error) {
      logger.error(`call:reject error: ${error.message}`);
    }
  });

  // 4. Exchange WebRTC ICE candidate
  socket.on('call:ice-candidate', (data) => {
    try {
      const { targetUserId, candidate, callId } = data;
      if (!targetUserId || !candidate) return;

      const targetIdStr = String(targetUserId);
      io.to(`user_${targetIdStr}`).emit('call:ice-candidate', {
        callId,
        candidate,
        fromUserId: currentUserId,
      });
      io.to(`vendor_${targetIdStr}`).emit('call:ice-candidate', {
        callId,
        candidate,
        fromUserId: currentUserId,
      });
    } catch (error) {
      logger.error(`call:ice-candidate error: ${error.message}`);
    }
  });

  // 5. End active call (Hang up from either side)
  socket.on('call:end', async (data) => {
    try {
      const { callId, targetUserId } = data || {};
      const call = (callId && activeCalls.get(callId)) || findCallByUser(currentUserId);

      const otherUserId = targetUserId ? String(targetUserId) : (call ? (String(call.callerId) === currentUserId ? String(call.targetUserId) : String(call.callerId)) : null);

      logger.info(`Call ended [${callId || call?.callId || 'unknown'}] by ${currentUserId}. Notifying peer: ${otherUserId}`);

      // Notify other user to terminate immediately
      if (otherUserId) {
        io.to(`user_${otherUserId}`).emit('call:ended', { callId: callId || call?.callId, endedBy: currentUserId });
        io.to(`vendor_${otherUserId}`).emit('call:ended', { callId: callId || call?.callId, endedBy: currentUserId });
      }

      // Also confirm back to the person who clicked end
      socket.emit('call:ended', { callId: callId || call?.callId, endedBy: currentUserId });

      // Calculate duration & save in chat history
      if (call) {
        if (call.startTime) {
          const durationSeconds = Math.max(1, Math.round((Date.now() - call.startTime) / 1000));
          await recordCallMessage(io, call, 'completed', durationSeconds);
        } else {
          await recordCallMessage(io, call, 'missed', 0);
        }
        activeCalls.delete(call.callId);
      }
    } catch (error) {
      logger.error(`call:end error: ${error.message}`);
    }
  });

  // 6. Handle disconnect during call
  socket.on('disconnect', async () => {
    const call = findCallByUser(currentUserId);
    if (call) {
      const otherUserId = String(call.callerId) === currentUserId ? String(call.targetUserId) : String(call.callerId);

      io.to(`user_${otherUserId}`).emit('call:ended', { callId: call.callId, endedBy: currentUserId, reason: 'disconnected' });
      io.to(`vendor_${otherUserId}`).emit('call:ended', { callId: call.callId, endedBy: currentUserId, reason: 'disconnected' });

      if (call.startTime) {
        const durationSeconds = Math.max(1, Math.round((Date.now() - call.startTime) / 1000));
        await recordCallMessage(io, call, 'completed', durationSeconds);
      } else {
        await recordCallMessage(io, call, 'missed', 0);
      }
      activeCalls.delete(call.callId);
      logger.info(`Active call [${call.callId}] terminated due to disconnect of user ${currentUserId}`);
    }
  });
}
