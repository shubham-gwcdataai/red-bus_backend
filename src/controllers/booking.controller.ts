import { Response, NextFunction } from 'express';
import { getClient, query }  from '../config/db';   // ✅ proper import, no require()
import { AuthRequest }        from '../types';
import { BookingInput }       from '../schemas/booking.schema';
import { Request }            from 'express';

// ─── Generate unique PNR ──────────────────────────────────────────
const generatePNR = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pnr = 'RB';
  for (let i = 0; i < 9; i++) pnr += chars[Math.floor(Math.random() * chars.length)];
  return pnr;
};

/**
 * @swagger
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create a new booking (direct — no payment)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingRequest'
 *     responses:
 *       201:
 *         description: Booking confirmed
 *       400:
 *         description: Seat already booked / validation error
 *       401:
 *         description: Unauthorized
 */
export const createBooking = async (
  req: AuthRequest & Request<{}, {}, BookingInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const {
      tripId, boardingPointId, droppingPointId,
      contactEmail, contactPhone, totalAmount,
      selectedSeats, passengers,
    } = req.body;

    const userId = req.user!.id;

    // ── 1. Validate trip exists and is active ─────────────────────
    const tripCheck = await client.query(
      `SELECT id, travel_date, is_active FROM trips WHERE id = $1`,
      [tripId]
    );
    if (tripCheck.rows.length === 0 || !tripCheck.rows[0].is_active) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Trip not found or inactive' });
      return;
    }

    // ── 2. Date validation — cannot book past trips ───────────────
    const travelDate = new Date(tripCheck.rows[0].travel_date);
    const today      = new Date(); today.setHours(0, 0, 0, 0);
    if (travelDate < today) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Cannot book tickets for past dates' });
      return;
    }

    // ── 3. Lock seats FOR UPDATE (prevents double booking) ────────
    const seatCheck = await client.query(
      `SELECT id, seat_number, status FROM seats
       WHERE trip_id = $1 AND seat_number = ANY($2::varchar[])
       FOR UPDATE`,
      [tripId, selectedSeats]
    );

    // Verify all requested seats were found
    if (seatCheck.rows.length !== selectedSeats.length) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'One or more seats not found for this trip' });
      return;
    }

    // Verify none are already booked
    const alreadyBooked = seatCheck.rows.filter((s) => s.status === 'booked');
    if (alreadyBooked.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        error: `Seats already booked: ${alreadyBooked.map((s) => s.seat_number).join(', ')}`,
      });
      return;
    }

    // ── 4. Generate unique PNR ────────────────────────────────────
    let pnr = generatePNR();
    // Retry once if collision (extremely rare)
    const pnrCheck = await client.query('SELECT id FROM bookings WHERE pnr = $1', [pnr]);
    if (pnrCheck.rows.length > 0) pnr = generatePNR();

    // ── 5. Create the booking ─────────────────────────────────────
    const bookingResult = await client.query(
      `INSERT INTO bookings
         (user_id, trip_id, boarding_point_id, dropping_point_id,
          pnr, total_amount, contact_email, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [userId, tripId, boardingPointId, droppingPointId,
       pnr, totalAmount, contactEmail, contactPhone]
    );
    const booking = bookingResult.rows[0];

    // ── 6. Insert passengers ──────────────────────────────────────
    for (const p of passengers) {
      const seatRow = seatCheck.rows.find((s) => s.seat_number === p.seatNumber);
      await client.query(
        `INSERT INTO booking_seats
           (booking_id, seat_id, seat_number, passenger_name, passenger_age, passenger_gender)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [booking.id, seatRow?.id, p.seatNumber, p.name, p.age, p.gender]
      );
    }

    // ── 7. Mark seats as booked ───────────────────────────────────
    await client.query(
      `UPDATE seats SET status = 'booked'
       WHERE trip_id = $1 AND seat_number = ANY($2::varchar[])`,
      [tripId, selectedSeats]
    );

    // ── 8. Decrement available seats ──────────────────────────────
    await client.query(
      'UPDATE trips SET available_seats = available_seats - $1 WHERE id = $2',
      [selectedSeats.length, tripId]
    );

    await client.query('COMMIT');

    // ── 9. Return full booking details ────────────────────────────
    const full = await query(
      `SELECT b.*,
              t.source, t.destination, t.departure_time, t.arrival_time,
              t.duration, t.travel_date,
              bu.name AS bus_name, bu.bus_type,
              bp.name AS boarding_name, bp.time AS boarding_time, bp.address AS boarding_address,
              dp.name AS dropping_name, dp.time AS dropping_time, dp.address AS dropping_address
       FROM bookings b
       JOIN trips t         ON t.id  = b.trip_id
       JOIN buses bu        ON bu.id = t.bus_id
       LEFT JOIN boarding_points bp ON bp.id = b.boarding_point_id
       LEFT JOIN dropping_points dp ON dp.id = b.dropping_point_id
       WHERE b.id = $1`,
      [booking.id]
    );

    const bookingSeats = await query(
      'SELECT * FROM booking_seats WHERE booking_id = $1',
      [booking.id]
    );

    res.status(201).json({
      success: true,
      message: 'Booking confirmed!',
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
 * /bookings/my:
 *   get:
 *     tags: [Bookings]
 *     summary: Get all bookings for the logged-in user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user bookings
 */
export const getMyBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await query(
      `SELECT b.*,
              t.source, t.destination, t.departure_time, t.arrival_time,
              t.duration, t.travel_date,
              bu.name AS bus_name, bu.bus_type,
              bp.name AS boarding_name, bp.time AS boarding_time, bp.address AS boarding_address,
              dp.name AS dropping_name, dp.time AS dropping_time, dp.address AS dropping_address
       FROM bookings b
       JOIN trips t  ON t.id  = b.trip_id
       JOIN buses bu ON bu.id = t.bus_id
       JOIN boarding_points bp ON bp.id = b.boarding_point_id
       JOIN dropping_points dp ON dp.id = b.dropping_point_id
       WHERE b.user_id = $1
       ORDER BY b.booked_at DESC`,
      [req.user!.id]
    );

    // Attach passengers to each booking
    const bookings = await Promise.all(
      result.rows.map(async (b) => {
        const seats = await query(
          'SELECT * FROM booking_seats WHERE booking_id = $1',
          [b.id]
        );
        return { ...b, passengers: seats.rows };
      })
    );

    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /bookings/{id}/cancel:
 *   put:
 *     tags: [Bookings]
 *     summary: Cancel a booking
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled
 *       400:
 *         description: Already cancelled or trip already departed
 *       404:
 *         description: Booking not found
 */
export const cancelBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    const bookingResult = await client.query(
      `SELECT b.*, t.travel_date, t.departure_time
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       WHERE b.id = $1 AND b.user_id = $2`,
      [id, req.user!.id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }

    const booking = bookingResult.rows[0];

    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Booking already cancelled' });
      return;
    }

    const { trip_id } = booking;

    // Get booked seat numbers
    const bookedSeats = await client.query(
      'SELECT seat_number FROM booking_seats WHERE booking_id = $1',
      [id]
    );
    const seatNumbers = bookedSeats.rows.map((s: { seat_number: string }) => s.seat_number);

    // Update booking status
    await client.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [id]
    );

    // Release seats back to available
    await client.query(
      `UPDATE seats SET status = 'available'
       WHERE trip_id = $1 AND seat_number = ANY($2::varchar[])`,
      [trip_id, seatNumbers]
    );

    // Restore available seat count on trip
    await client.query(
      'UPDATE trips SET available_seats = available_seats + $1 WHERE id = $2',
      [seatNumbers.length, trip_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Booking cancelled successfully. Refund will be processed in 5–7 business days.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};