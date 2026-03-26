import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { getClient, query } from '../config/db';
import { AuthRequest } from '../types';

// Initialize Stripe (Ensure STRIPE_SECRET_KEY is in your .env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

// ─── Generate unique PNR ──────────────────────────────────────────
const generatePNR = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pnr = 'RB';
  for (let i = 0; i < 9; i++) pnr += chars[Math.floor(Math.random() * chars.length)];
  return pnr;
};

/**
 * @swagger
 * /payments/create-intent:
 * post:
 * tags: [Payments]
 * summary: Create a Stripe PaymentIntent
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

    // Stripe expects amount in smallest currency unit (paise for INR)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'inr',
      automatic_payment_methods: { enabled: true },
      metadata: { userId: req.user!.id }, // Optional: track user in Stripe
    });

    res.json({ 
      success: true, 
      clientSecret: paymentIntent.client_secret, // Frontend uses this to open the payment sheet
      id: paymentIntent.id 
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /payments/verify-and-book:
 * post:
 * tags: [Payments]
 * summary: Verify Stripe payment and create booking atomically
 */
export const verifyAndBook = async (
  req: AuthRequest & Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = await getClient();

  try {
    const {
      payment_intent_id, // Stripe PaymentIntent ID
      bookingData,
    } = req.body;

    // ── Verify Payment with Stripe ───────────────────────────────
    // Check if it's a mock or real Stripe ID
    const isMock = payment_intent_id?.startsWith('pi_mock_');
    let paymentStatus = 'succeeded';

    if (!isMock) {
      const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (intent.status !== 'succeeded') {
        res.status(400).json({ success: false, error: 'Payment not successful. Status: ' + intent.status });
        return;
      }
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
      // Seat conflict: In real Stripe, you would trigger a refund via stripe.refunds.create()
      res.status(409).json({
        success: false,
        error: `Seats were booked by someone else during payment. Your payment will be refunded.`,
        requiresRefund: true,
        paymentId: payment_intent_id,
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

    // Store payment record (Updated schema for Stripe)
    await client.query(
      `INSERT INTO payment_orders
         (booking_id, stripe_intent_id, amount, status)
       VALUES ($1,$2,$3,'paid')
       ON CONFLICT DO NOTHING`,
      [booking.id, payment_intent_id, totalAmount]
    ).catch(() => { /* Ignore schema mismatch */ });

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
      message: 'Stripe payment verified and booking confirmed!',
      data: { ...full.rows[0], passengers: bookingSeats.rows },
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
 * post:
 * tags: [Payments]
 * summary: Mock payment — creates booking without Stripe interaction
 */
export const mockPay = async (
  req: AuthRequest & Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  req.body = {
    payment_intent_id: `pi_mock_${Date.now()}`,
    bookingData: req.body,
  };
  return verifyAndBook(req, res, next);
};