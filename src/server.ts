import express    from 'express';
import cors       from 'cors';
import helmet     from 'helmet';
import morgan     from 'morgan';
import dotenv     from 'dotenv';

import { testConnection }           from './config/db';
import { setupSwagger }             from './config/swagger';
import { errorHandler, notFound }   from './middleware/error.middleware';

import authRoutes    from './routes/auth.routes';
import busRoutes     from './routes/bus.routes';
import bookingRoutes from './routes/booking.routes';
import adminRoutes   from './routes/admin.routes';
import paymentRoutes from './routes/payment.routes';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req, res) => {
  res.json({
    status:    'OK',
    timestamp: new Date().toISOString(),
    service:   'RedBus Clone API v2.0',
    version:   '2.0.0',
  });
});

setupSwagger(app);

app.use('/api/auth',     authRoutes);
app.use('/api/buses',    busRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);   
app.use('/api/admin',    adminRoutes);     

// ── 404 & Error ───────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────
const startServer = async (): Promise<void> => {
  await testConnection();

  app.listen(PORT, () => {
    console.log('\n ─────────────────────────────────────────────');
    console.log(`Server:      http://localhost:${PORT}`);
    console.log(`Swagger UI:  http://localhost:${PORT}/api/docs`);
    console.log(`Health:      http://localhost:${PORT}/health`);
    console.log(`Admin login: admin@redbus.com / Admin@123`);
    console.log(`Admin panel: http://localhost:3000/admin`);
    console.log('─────────────────────────────────────────────\n');
  });
};

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

export default app;
