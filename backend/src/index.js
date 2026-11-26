import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import logger from './utils/logger.js';
import { initSocket } from './socket/socket.js';
import { startRiderPresenceSweep } from './utils/riderPresence.util.js';

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  const httpServer = createServer(app);
  
  // Initialize Socket.io
  initSocket(httpServer);

  // Auto-offline riders whose app has been inactive (no poll / GPS / socket) for a while
  startRiderPresenceSweep();

  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
});

