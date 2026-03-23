// ─── payment.routes.ts ───────────────────────────────────────────
import { Router }  from 'express';
import { protect } from '../middleware/auth.middleware';
import {
  createOrder, verifyAndBook, mockPay,
} from '../controllers/payment.controller';

const router = Router();

// All payment routes require authentication
router.use(protect);

/**
 * @swagger
 * /payments/create-order:
 *   post:
 *     tags: [Payments]
 *     summary: Create Razorpay order before checkout
 *     security:
 *       - BearerAuth: []
 */
router.post('/create-order',    createOrder);

/**
 * @swagger
 * /payments/verify-and-book:
 *   post:
 *     tags: [Payments]
 *     summary: Verify payment and atomically create booking
 *     security:
 *       - BearerAuth: []
 */
router.post('/verify-and-book', verifyAndBook);

/**
 * @swagger
 * /payments/mock-pay:
 *   post:
 *     tags: [Payments]
 *     summary: Demo payment — skips real gateway, creates booking directly
 *     security:
 *       - BearerAuth: []
 */
router.post('/mock-pay',        mockPay);

export default router;
