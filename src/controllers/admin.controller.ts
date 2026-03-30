import { Response, NextFunction } from 'express';
import { query, getClient } from '../config/db';
import { AuthRequest }      from '../types';
 
/**
 * @swagger
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get dashboard statistics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:    { type: integer }
 *                     totalBuses:    { type: integer }
 *                     totalTrips:    { type: integer }
 *                     totalBookings: { type: integer }
 *                     totalRevenue:  { type: number }
 *                     todayBookings: { type: integer }
 */
export const getStats = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const [users, buses, trips, bookings, revenue, todayBookings] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM buses'),
      query('SELECT COUNT(*) FROM trips WHERE is_active = true'),
      query('SELECT COUNT(*) FROM bookings'),
      query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM bookings WHERE status = 'confirmed'`),
      query(`SELECT COUNT(*) FROM bookings WHERE DATE(booked_at) = CURRENT_DATE`),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers:    parseInt(users.rows[0].count),
        totalBuses:    parseInt(buses.rows[0].count),
        totalTrips:    parseInt(trips.rows[0].count),
        totalBookings: parseInt(bookings.rows[0].count),
        totalRevenue:  parseFloat(revenue.rows[0].total),
        todayBookings: parseInt(todayBookings.rows[0].count),
      },
    });
  } catch (err) { next(err); }
};

// ─── BUS MANAGEMENT ──────────────────────────────────────────────

/**
 * @swagger
 * /admin/buses:
 *   get:
 *     tags: [Admin]
 *     summary: Get all buses
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all buses
 */
export const getAllBuses = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await query('SELECT * FROM buses ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

/**
 * @swagger
 * /admin/buses:
 *   post:
 *     tags: [Admin]
 *     summary: Add a new bus
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, operatorName, busType]
 *             properties:
 *               name:
 *                 type: string
 *                 example: SRS Travels
 *               operatorName:
 *                 type: string
 *                 example: SRS Travels Pvt. Ltd.
 *               busType:
 *                 type: string
 *                 enum: [AC Sleeper, Non-AC Sleeper, AC Seater, Non-AC Seater, AC Semi-Sleeper]
 *                 example: AC Sleeper
 *               totalSeats:
 *                 type: integer
 *                 example: 40
 *               amenities:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["WiFi", "Charging Point", "Water Bottle"]
 *               cancellationPolicy:
 *                 type: string
 *                 example: Free cancellation up to 2 hours before departure
 *               refundPolicy:
 *                 type: string
 *                 example: 100% refund on cancellation 24h before
 *     responses:
 *       201:
 *         description: Bus created successfully
 *       400:
 *         description: Missing required fields
 */
export const createBus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      name, operatorName, busType,
      totalSeats, amenities,
      cancellationPolicy, refundPolicy,
    } = req.body;

    if (!name || !operatorName || !busType) {
      res.status(400).json({
        success: false,
        error: 'name, operatorName, and busType are required',
      });
      return;
    }

    const result = await query(
      `INSERT INTO buses
         (name, operator_name, bus_type, total_seats, amenities,
          cancellation_policy, refund_policy)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        name, operatorName, busType,
        totalSeats || 40,
        amenities  || [],
        cancellationPolicy || '',
        refundPolicy       || '',
      ]
    );

    res.status(201).json({
      success: true,
      data:    result.rows[0],
      message: 'Bus created successfully',
    });
  } catch (err) { next(err); }
};

/**
 * @swagger
 * /admin/buses/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update a bus
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bus UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:               { type: string }
 *               operatorName:       { type: string }
 *               busType:            { type: string }
 *               totalSeats:         { type: integer }
 *               amenities:          { type: array, items: { type: string } }
 *               cancellationPolicy: { type: string }
 *               refundPolicy:       { type: string }
 *     responses:
 *       200:
 *         description: Bus updated
 *       404:
 *         description: Bus not found
 */
export const updateBus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name, operatorName, busType,
      totalSeats, amenities,
      cancellationPolicy, refundPolicy,
    } = req.body;

    const result = await query(
      `UPDATE buses SET
         name                = COALESCE($1, name),
         operator_name       = COALESCE($2, operator_name),
         bus_type            = COALESCE($3, bus_type),
         total_seats         = COALESCE($4, total_seats),
         amenities           = COALESCE($5, amenities),
         cancellation_policy = COALESCE($6, cancellation_policy),
         refund_policy       = COALESCE($7, refund_policy)
       WHERE id = $8
       RETURNING *`,
      [name, operatorName, busType, totalSeats,
       amenities, cancellationPolicy, refundPolicy, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Bus not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0], message: 'Bus updated' });
  } catch (err) { next(err); }
};

/**
 * @swagger
 * /admin/buses/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a bus
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bus UUID
 *     responses:
 *       200:
 *         description: Bus deleted
 *       404:
 *         description: Bus not found
 */
export const deleteBus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query(
      'DELETE FROM buses WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Bus not found' });
      return;
    }

    res.json({ success: true, message: 'Bus deleted successfully' });
  } catch (err) { next(err); }
};

// ─── TRIP MANAGEMENT ──────────────────────────────────────────────

/**
 * @swagger
 * /admin/trips:
 *   get:
 *     tags: [Admin]
 *     summary: Get all trips
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all trips
 */
export const getAllTrips = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await query(
      `SELECT t.*, b.name AS bus_name, b.bus_type
       FROM trips t
       JOIN buses b ON b.id = t.bus_id
       ORDER BY t.travel_date DESC, t.departure_time ASC
       LIMIT 200`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

/**
 * @swagger
 * /admin/trips:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new trip
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [busId, source, destination, departureTime, price, travelDate]
 *             properties:
 *               busId:
 *                 type: string
 *                 example: a1000000-0000-0000-0000-000000000001
 *               source:
 *                 type: string
 *                 example: Bangalore
 *               destination:
 *                 type: string
 *                 example: Chennai
 *               departureTime:
 *                 type: string
 *                 example: "21:00"
 *               arrivalTime:
 *                 type: string
 *                 example: "06:30"
 *               duration:
 *                 type: string
 *                 example: "9h 30m"
 *               price:
 *                 type: number
 *                 example: 899
 *               originalPrice:
 *                 type: number
 *                 example: 1100
 *               travelDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-25"
 *               totalSeats:
 *                 type: integer
 *                 example: 40
 *               boardingPoints:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:    { type: string, example: "Majestic Bus Stand" }
 *                     time:    { type: string, example: "21:00" }
 *                     address: { type: string, example: "Majestic, Bangalore" }
 *               droppingPoints:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:    { type: string, example: "Koyambedu" }
 *                     time:    { type: string, example: "06:30" }
 *                     address: { type: string, example: "Koyambedu, Chennai" }
 *     responses:
 *       201:
 *         description: Trip created successfully
 *       400:
 *         description: Missing required fields or past date
 */
export const createTrip = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      busId, source, destination,
      departureTime, arrivalTime,
      duration, price, originalPrice,
      travelDate, totalSeats,
      boardingPoints = [],
      droppingPoints = [],
    } = req.body;

    if (!busId || !source || !destination || !departureTime || !price || !travelDate) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Missing required trip fields' });
      return;
    }

    // Block past dates
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(travelDate) < today) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Cannot create trip for a past date' });
      return;
    }

    const tripResult = await client.query(
      `INSERT INTO trips
         (bus_id, source, destination, departure_time, arrival_time,
          duration, price, original_price, travel_date, available_seats, rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        busId, source, destination,
        departureTime,
        arrivalTime || departureTime,
        duration     || '7h 00m',
        price,
        originalPrice || null,
        travelDate,
        totalSeats    || 40,
        4.0,
      ]
    );

    const trip = tripResult.rows[0];

    for (const bp of boardingPoints) {
      await client.query(
        'INSERT INTO boarding_points (trip_id, name, time, address) VALUES ($1,$2,$3,$4)',
        [trip.id, bp.name, bp.time, bp.address]
      );
    }

    for (const dp of droppingPoints) {
      await client.query(
        'INSERT INTO dropping_points (trip_id, name, time, address) VALUES ($1,$2,$3,$4)',
        [trip.id, dp.name, dp.time, dp.address]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data:    trip,
      message: 'Trip created successfully',
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
 * /admin/trips/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update a trip
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               price:          { type: number,  example: 950 }
 *               availableSeats: { type: integer, example: 35 }
 *               isActive:       { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Trip updated
 *       404:
 *         description: Trip not found
 */
export const updateTrip = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { price, availableSeats, isActive } = req.body;

    const result = await query(
      `UPDATE trips SET
         price           = COALESCE($1, price),
         available_seats = COALESCE($2, available_seats),
         is_active       = COALESCE($3, is_active)
       WHERE id = $4
       RETURNING *`,
      [price, availableSeats, isActive, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0], message: 'Trip updated' });
  } catch (err) { next(err); }
};

/**
 * @swagger
 * /admin/trips/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a trip
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
 *         description: Trip deleted
 *       400:
 *         description: Cannot delete trip with active bookings
 *       404:
 *         description: Trip not found
 */
export const deleteTrip = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const bookingCheck = await query(
      `SELECT COUNT(*) FROM bookings
       WHERE trip_id = $1 AND status = 'confirmed'`,
      [id]
    );

    if (parseInt(bookingCheck.rows[0].count) > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete trip with active confirmed bookings',
      });
      return;
    }

    await query('DELETE FROM trips WHERE id = $1', [id]);
    res.json({ success: true, message: 'Trip deleted successfully' });
  } catch (err) { next(err); }
};

// ─── BOOKING & USER MANAGEMENT ────────────────────────────────────

/**
 * @swagger
 * /admin/bookings:
 *   get:
 *     tags: [Admin]
 *     summary: Get all bookings
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all bookings with user and trip details
 */
export const getAllBookings = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await query(
      `SELECT b.*, t.source, t.destination, t.travel_date,
              bu.name AS bus_name,
              u.name  AS user_name,
              u.email AS user_email
       FROM bookings b
       JOIN trips t  ON t.id  = b.trip_id
       JOIN buses bu ON bu.id = t.bus_id
       JOIN users u  ON u.id  = b.user_id
       ORDER BY b.booked_at DESC
       LIMIT 500`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Get all users
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all registered users
 */
export const getAllUsers = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, name, email, phone, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};