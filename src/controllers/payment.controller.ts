import { Request, Response, NextFunction } from 'express';
import crypto        from 'crypto';
import { getClient, query } from '../config/db';
import { AuthRequest }      from '../types';

// ─── Generate unique PNR ──────────────────────────────────────────
const generatePNR = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pnr = 'RB';
  for (let i = 0; i < 9; i++) pnr += chars[Math.floor(Math.random() * chars.length)];
  return pnr;
};

/**
 * @swagger
 * /payments/create-order:
 *   post:
 *     tags: [Payments]
 *     summary: Create a Razorpay payment order
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in INR
 *     responses:
 *       200:
 *         description: Payment order created
 */
export const createOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: 'Invalid amount' });
      return;
    }

    // In production: call Razorpay SDK to create order
    // const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    // const order = await razorpay.orders.create({ amount: amount * 100, currency: 'INR', receipt: `rcpt_${Date.now()}` });

    // Mock order for demo
    const mockOrder = {
      orderId:  `order_mock_${Date.now()}`,
      amount:   Math.round(amount * 100),  // paise
      currency: 'INR',
      keyId:    process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
    };

    res.json({ success: true, data: mockOrder });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /payments/verify-and-book:
 *   post:
 *     tags: [Payments]
 *     summary: Verify Razorpay payment and create booking atomically
 *     security:
 *       - BearerAuth: []
 */
export const verifyAndBook = async (
  req: AuthRequest & Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = await getClient();

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingData,
    } = req.body;

    // ── Verify signature ──────────────────────────────────────────
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // In mock mode, skip real signature verification
    const isMock = razorpay_order_id?.startsWith('order_mock_');
    if (!isMock && expectedSignature !== razorpay_signature) {
      res.status(400).json({ success: false, error: 'Payment verification failed. Invalid signature.' });
      return;
    }

    // ── Create booking after verified payment ─────────────────────
    await client.query('BEGIN');

    const {
      busId: tripId, boardingPointId, droppingPointId,
      contactEmail, contactPhone, totalAmount,
      selectedSeats, passengers,
    } = bookingData;

    const userId = req.user!.id;

    // Lock seats
    const seatCheck = await client.query(
      `SELECT id, seat_number, status FROM seats
       WHERE trip_id = $1 AND seat_number = ANY($2::varchar[])
       FOR UPDATE`,
      [tripId, selectedSeats]
    );

    const alreadyBooked = seatCheck.rows.filter((s) => s.status === 'booked');
    if (alreadyBooked.length > 0) {
      await client.query('ROLLBACK');
      // Payment was taken but seats gone — flag for refund
      res.status(409).json({
        success: false,
        error:   `Seats were booked by someone else during payment: ${alreadyBooked.map((s) => s.seat_number).join(', ')}. Your payment will be refunded.`,
        requiresRefund: true,
        paymentId: razorpay_payment_id,
      });
      return;
    }

    let pnr = generatePNR();
    const pnrCheck = await client.query('SELECT id FROM bookings WHERE pnr = $1', [pnr]);
    if (pnrCheck.rows.length > 0) pnr = generatePNR();

    const bookingResult = await client.query(
      `INSERT INTO bookings
         (user_id, trip_id, boarding_point_id, dropping_point_id,
          pnr, total_amount, contact_email, contact_phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed')
       RETURNING *`,
      [userId, tripId, boardingPointId, droppingPointId,
       pnr, totalAmount, contactEmail, contactPhone]
    );
    const booking = bookingResult.rows[0];

    for (const p of passengers) {
      const seatRow = seatCheck.rows.find((s) => s.seat_number === p.seatNumber);
      await client.query(
        `INSERT INTO booking_seats
           (booking_id, seat_id, seat_number, passenger_name, passenger_age, passenger_gender)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [booking.id, seatRow?.id, p.seatNumber, p.name, p.age, p.gender]
      );
    }

    await client.query(
      `UPDATE seats SET status = 'booked'
       WHERE trip_id = $1 AND seat_number = ANY($2::varchar[])`,
      [tripId, selectedSeats]
    );

    await client.query(
      'UPDATE trips SET available_seats = available_seats - $1 WHERE id = $2',
      [selectedSeats.length, tripId]
    );

    // Store payment record
    await client.query(
      `INSERT INTO payment_orders
         (booking_id, razorpay_order_id, razorpay_payment_id, amount, status)
       VALUES ($1,$2,$3,$4,'paid')
       ON CONFLICT DO NOTHING`,
      [booking.id, razorpay_order_id, razorpay_payment_id, totalAmount]
    ).catch(() => { /* payment_orders table may not exist in older schema — ignore */ });

    await client.query('COMMIT');

    const full = await query(
      `SELECT b.*,
              t.source, t.destination, t.departure_time, t.arrival_time,
              t.duration, t.travel_date,
              bu.name AS bus_name, bu.bus_type,
              bp.name AS boarding_name, bp.time AS boarding_time, bp.address AS boarding_address,
              dp.name AS dropping_name, dp.time AS dropping_time, dp.address AS dropping_address
       FROM bookings b
       JOIN trips t    ON t.id  = b.trip_id
       JOIN buses bu   ON bu.id = t.bus_id
       JOIN boarding_points bp ON bp.id = b.boarding_point_id
       JOIN dropping_points dp ON dp.id = b.dropping_point_id
       WHERE b.id = $1`,
      [booking.id]
    );

    const bookingSeats = await query(
      'SELECT * FROM booking_seats WHERE booking_id = $1',
      [booking.id]
    );

    res.status(201).json({
      success: true,
      message: 'Payment verified and booking confirmed!',
      data:    { ...full.rows[0], passengers: bookingSeats.rows },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * @swagger
 * /payments/mock-pay:
 *   post:
 *     tags: [Payments]
 *     summary: Mock payment — creates booking without real payment gateway
 *     security:
 *       - BearerAuth: []
 */
export const mockPay = async (
  req: AuthRequest & Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Delegate directly to verify-and-book with mock order details
  req.body = {
    razorpay_order_id:   `order_mock_${Date.now()}`,
    razorpay_payment_id: `pay_mock_${Date.now()}`,
    razorpay_signature:  'mock_signature',
    bookingData:          req.body,
  };
  return verifyAndBook(req, res, next);
};
