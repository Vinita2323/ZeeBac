import express from 'express';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import logger from './utils/logger.js';

const app = express();

// Behind Nginx reverse proxy: trust the proxy hop so client IPs (and express-rate-limit) work accurately
app.set('trust proxy', process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : 1);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// HTTP request logging (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // Minimal logging for production
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Legacy /uploads handler — all permanent files are served via Cloudinary CDN; prevent local temp exposure
app.use('/uploads', (req, res) => {
  res.status(404).json({ success: false, message: 'Legacy local uploads are deprecated. Assets are served via Cloudinary CDN.' });
});

// Simple health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is running properly!' });
});

// Import routes
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import vendorRoutes from './routes/vendor.routes.js';
import userRoutes from './routes/user.routes.js';
import chatRoutes from './routes/chat.routes.js';
import supportRoutes from './routes/support.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import posRoutes from './routes/pos.routes.js';
import fcmRoutes from './routes/fcm.routes.js';

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/v1/fcm-tokens', fcmRoutes);
app.use('/api/fcm-tokens', fcmRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

export default app;
