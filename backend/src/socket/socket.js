import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import registerChatHandlers from './chatHandlers.js';
import registerCallHandlers from './callHandlers.js';

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Socket Auth Middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.user = decoded; // Attach user info to socket
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (User: ${socket.user.id}, Role: ${socket.user.role})`);

    // Auto-join private user / vendor / customer / rider rooms for targeted real-time events
    if (socket.user?.id) {
      socket.join(`user_${socket.user.id}`);
      socket.join(`user:${socket.user.id}`);

      if (socket.user.role === 'vendor') {
        socket.join(`vendor_${socket.user.id}`);
        socket.join(`vendor:${socket.user.id}`);
      } else if (socket.user.role === 'delivery') {
        socket.join(`rider_${socket.user.id}`);
        socket.join(`rider:${socket.user.id}`);
      } else {
        socket.join(`customer_${socket.user.id}`);
        socket.join(`customer:${socket.user.id}`);
      }
    }

    // Dynamic order room subscription for live map GPS telemetry and lifecycle updates
    socket.on('order:join', ({ orderId } = {}) => {
      if (orderId) {
        socket.join(`order:${orderId}`);
        logger.info(`[Socket] User ${socket.user?.id} joined room order:${orderId}`);
      }
    });

    socket.on('order:leave', ({ orderId } = {}) => {
      if (orderId) {
        socket.leave(`order:${orderId}`);
        logger.info(`[Socket] User ${socket.user?.id} left room order:${orderId}`);
      }
    });

    // Register handlers
    registerChatHandlers(io, socket);
    registerCallHandlers(io, socket);

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};
