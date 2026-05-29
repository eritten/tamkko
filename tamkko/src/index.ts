import http from 'node:http';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import morgan from 'morgan';
import { Server } from 'socket.io';
import { connectDB } from '@config/db';
import { env } from '@config/env';
import { errorHandler } from '@middleware/errorHandler';
import { authRoutes } from '@routes/auth.routes';
import { videoRoutes } from '@routes/video.routes';
import tipRoutes, { walletRoutes } from '@routes/tipping.routes';
import notificationRoutes from '@routes/notifications.routes';
import referralRoutes from '@routes/referral.routes';
import vipRoutes from '@routes/vip.routes';
import paymentRoutes from '@routes/payment.routes';
import adminRoutes from '@routes/admin.routes';
import followRoutes from '@routes/follow.routes';
import messageRoutes from '@routes/message.routes';
import { initSockets } from '@sockets/index';

const app: Application = express();
const httpServer = http.createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: env.CLIENT_URL,
    credentials: true,
  },
});
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

initSockets(io);

const apiRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});

// Global Middleware
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'production' ? ['https://tamkko.app'] : '*',
  credentials: true,
}));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api', apiRateLimiter);
app.use('/api/v1/payments', paymentRoutes);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(hpp());
app.use(compression());
app.use(cookieParser());

// Health Check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1/tips', tipRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/referral', referralRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1', referralRoutes);
app.use('/api/v1/vip', vipRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/users', followRoutes);
app.use('/api/v1/messages', messageRoutes);

// Global Error Handler
app.use(errorHandler);

// Start Server
const PORT = env.PORT || 5000;

const start = async () => {
  const { startNotificationWorker } = await import('@queues/notification.queue');
  startNotificationWorker();

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${env.NODE_ENV} mode`);
  });
};

const boot = env.SKIP_DB_CONNECT ? Promise.resolve() : connectDB();

boot.then(start).catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

export default app;
