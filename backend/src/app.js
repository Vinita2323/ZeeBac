import express from 'express';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import logger from './utils/logger.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// HTTP request logging (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // Minimal logging for production
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Serve uploaded files as static
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Simple health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is running properly!' });
});

// Import routes
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import vendorRoutes from './routes/vendor.routes.js';
import userRoutes from './routes/user.routes.js';

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/user', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

export default app;
