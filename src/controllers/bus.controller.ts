import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/db';
import { v4 as uuidv4 } from 'uuid';

// ─── All Indian cities we support ────────────────────────────────
const CITY_PAIRS_DURATIONS: Record<string, { duration: string; baseHours: number }> = {
  default: { duration: '6h 00m', baseHours: 6 },
};

// Calculate approximate duration based on distance
const getDuration = (source: string, destination: string): string => {
  const knownRoutes: Record<string, string> = {
    'bangalore-chennai':     '9h 30m',
    'chennai-bangalore':     '9h 30m',
    'mumbai-pune':           '3h 30m',
    'pune-mumbai':           '3h 30m',
    'delhi-jaipur':          '5h 30m',
    'jaipur-delhi':          '5h 30m',
    'hyderabad-bangalore':   '9h 30m',
    'bangalore-hyderabad':   '9h 30m',
    'mumbai-goa':            '9h 00m',
    'goa-mumbai':            '9h 00m',
    'delhi-agra':            '4h 00m',
    'agra-delhi':            '4h 00m',
    'bangalore-mysore':      '3h 00m',
    'mysore-bangalore':      '3h 00m',
    'chennai-coimbatore':    '7h 00m',
    'coimbatore-chennai':    '7h 00m',
    'kolkata-patna':         '8h 00m',
    'patna-kolkata':         '8h 00m',
    'mumbai-nashik':         '3h 30m',
    'nashik-mumbai':         '3h 30m',
    'hyderabad-vijayawada':  '5h 00m',
    'vijayawada-hyderabad':  '5h 00m',
  };
  const key = `${source.toLowerCase()}-${destination.toLowerCase()}`;
  return knownRoutes[key] || '7h 00m';
};

// Calculate arrival time from departure + duration
const addDuration = (departureTime: string, duration: string): string => {
  const [depH, depM]  = departureTime.split(':').map(Number);
  const match         = duration.match(/(\d+)h\s*(\d+)?m?/);
  const hours         = match ? parseInt(match[1]) : 7;
  const mins          = match && match[2] ? parseInt(match[2]) : 0;
  const totalMins     = depH * 60 + depM + hours * 60 + mins;
  const arrH          = Math.floor(totalMins / 60) % 24;
  const arrM          = totalMins % 60;
  return `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;
};

// Seed operator templates
const OPERATOR_TEMPLATES = [
  {
    name: 'SRS Travels',
    operatorName: 'SRS Travels Pvt. Ltd.',
    busType: 'AC Sleeper',
    priceMultiplier: 1.0,
    amenities: ['WiFi', 'Charging Point', 'Blanket', 'Water Bottle', 'Live Tracking'],
    rating: 4.2,
    reviews: 1892,
    departureTime: '21:00',
    cancellationPolicy: 'Free cancellation up to 2 hours before departure',
    refundPolicy: '100% refund on cancellation 24h before',
  },
  {
    name: 'Orange Tours',
    operatorName: 'Orange Tours & Travels',
    busType: 'AC Semi-Sleeper',
    priceMultiplier: 0.85,
    amenities: ['Charging Point', 'Water Bottle', 'Reading Light'],
    rating: 4.0,
    reviews: 3241,
    departureTime: '22:30',
    cancellationPolicy: 'Free cancellation up to 4 hours before departure',
    refundPolicy: '80% refund on cancellation 12h before',
  },
  {
    name: 'VRL Travels',
    operatorName: 'VRL Travels Ltd.',
    busType: 'Non-AC Sleeper',
    priceMultiplier: 0.65,
    amenities: ['Blanket', 'Water Bottle'],
    rating: 3.8,
    reviews: 2100,
    departureTime: '20:00',
    cancellationPolicy: 'No cancellation after booking',
    refundPolicy: 'Non-refundable',
  },
  {
    name: 'Kallada Travels',
    operatorName: 'Kallada Travels',
    busType: 'AC Sleeper',
    priceMultiplier: 1.2,
    amenities: ['WiFi', 'Charging Point', 'Blanket', 'Water Bottle', 'Snacks', 'Live Tracking'],
    rating: 4.5,
    reviews: 4567,
    departureTime: '19:30',
    cancellationPolicy: 'Free cancellation up to 1 hour before departure',
    refundPolicy: '100% refund on cancellation 24h before',
  },
  {
    name: 'KSRTC Express',
    operatorName: 'State Road Transport Corporation',
    busType: 'AC Seater',
    priceMultiplier: 0.75,
    amenities: ['Charging Point', 'Water Bottle'],
    rating: 4.1,
    reviews: 8900,
    departureTime: '06:00',
    cancellationPolicy: 'Free cancellation up to 30 mins before departure',
    refundPolicy: '90% refund on cancellation 2h before',
  },
  {
    name: 'IntrCity SmartBus',
    operatorName: 'IntrCity Pvt. Ltd.',
    busType: 'AC Seater',
    priceMultiplier: 0.9,
    amenities: ['WiFi', 'Charging Point', 'Water Bottle', 'Snacks'],
    rating: 4.6,
    reviews: 4100,
    departureTime: '07:00',
    cancellationPolicy: 'Free cancellation up to 1 hour before departure',
    refundPolicy: '100% refund',
  },
  {
    name: 'Chartered Bus',
    operatorName: 'Chartered Bus Services',
    busType: 'AC Sleeper',
    priceMultiplier: 1.1,
    amenities: ['WiFi', 'Charging Point', 'Blanket', 'Water Bottle'],
    rating: 4.3,
    reviews: 3800,
    departureTime: '23:00',
    cancellationPolicy: 'Free cancellation up to 3 hours before departure',
    refundPolicy: '90% refund on cancellation 12h before',
  },
  {
    name: 'Neeta Tours',
    operatorName: 'Neeta Tours & Travels',
    busType: 'Non-AC Seater',
    priceMultiplier: 0.55,
    amenities: ['Water Bottle'],
    rating: 3.6,
    reviews: 1500,
    departureTime: '08:30',
    cancellationPolicy: 'No cancellation',
    refundPolicy: 'Non-refundable',
  },
];

// Base price by bus type
const BASE_PRICES: Record<string, number> = {
  'AC Sleeper':      950,
  'AC Semi-Sleeper': 750,
  'Non-AC Sleeper':  550,
  'AC Seater':       650,
  'Non-AC Seater':   400,
};

/**
 * @swagger
 * /buses/search:
 *   get:
 *     tags: [Buses]
 *     summary: Search available buses between any two cities
 *     parameters:
 *       - in: query
 *         name: source
 *         required: true
 *         schema:
 *           type: string
 *         example: Bangalore
 *       - in: query
 *         name: destination
 *         required: true
 *         schema:
 *           type: string
 *         example: Mumbai
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-03-25"
 *     responses:
 *       200:
 *         description: List of available trips
 *       400:
 *         description: Missing required parameters
 */
export const searchBuses = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { source, destination, date } = req.query as {
      source: string; destination: string; date: string;
    };

    if (!source || !destination || !date) {
      res.status(400).json({
        success: false,
        error: 'source, destination and date are required',
      });
      return;
    }

    if (source.toLowerCase() === destination.toLowerCase()) {
      res.status(400).json({
        success: false,
        error: 'Source and destination cannot be the same',
      });
      return;
    }

    // ── Step 1: Check if real trips exist in DB ───────────────────
    const existing = await query(
      `SELECT COUNT(*) FROM trips t
       WHERE LOWER(t.source)      = LOWER($1)
         AND LOWER(t.destination) = LOWER($2)
         AND t.travel_date        = $3
         AND t.is_active          = true`,
      [source, destination, date]
    );

    // ── Step 2: No trips found → generate them dynamically ────────
    if (parseInt(existing.rows[0].count) === 0) {
      await generateTripsForRoute(source, destination, date);
    }

    // ── Step 3: Fetch trips with full details ─────────────────────
    const result = await query(
      `SELECT
         t.id,
         t.source,
         t.destination,
         t.departure_time,
         t.arrival_time,
         t.duration,
         t.price,
         t.original_price,
         t.travel_date,
         t.available_seats,
         t.rating,
         t.review_count,
         b.id            AS bus_id,
         b.name          AS bus_name,
         b.operator_name,
         b.bus_type,
         b.total_seats,
         b.amenities,
         b.cancellation_policy,
         b.refund_policy
       FROM trips t
       JOIN buses b ON b.id = t.bus_id
       WHERE LOWER(t.source)      = LOWER($1)
         AND LOWER(t.destination) = LOWER($2)
         AND t.travel_date        = $3
         AND t.is_active          = true
       ORDER BY t.departure_time ASC`,
      [source, destination, date]
    );

    // ── Step 4: Attach boarding & dropping points ─────────────────
    const trips = await Promise.all(
      result.rows.map(async (trip) => {
        const [boarding, dropping] = await Promise.all([
          query(
            'SELECT * FROM boarding_points WHERE trip_id = $1 ORDER BY time',
            [trip.id]
          ),
          query(
            'SELECT * FROM dropping_points WHERE trip_id = $1 ORDER BY time',
            [trip.id]
          ),
        ]);
        return {
          ...trip,
          boarding_points: boarding.rows,
          dropping_points: dropping.rows,
        };
      })
    );

    res.json({
      success: true,
      data:    trips,
      total:   trips.length,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Dynamically generate trips for any route ────────────────────
const generateTripsForRoute = async (
  source:      string,
  destination: string,
  date:        string
): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const duration = getDuration(source, destination);

    for (const template of OPERATOR_TEMPLATES) {
      // ── Create or reuse a bus ──────────────────────────────────
      const existingBus = await client.query(
        `SELECT id FROM buses WHERE name = $1 AND operator_name = $2`,
        [template.name, template.operatorName]
      );

      let busId: string;

      if (existingBus.rows.length > 0) {
        busId = existingBus.rows[0].id;
      } else {
        const busResult = await client.query(
          `INSERT INTO buses
             (name, operator_name, bus_type, total_seats, amenities,
              cancellation_policy, refund_policy)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [
            template.name,
            template.operatorName,
            template.busType,
            template.busType.includes('Sleeper') ? 40 : 44,
            template.amenities,
            template.cancellationPolicy,
            template.refundPolicy,
          ]
        );
        busId = busResult.rows[0].id;
      }

      // ── Calculate price & times ────────────────────────────────
      const basePrice     = BASE_PRICES[template.busType] || 700;
      const price         = Math.round(basePrice * template.priceMultiplier);
      const originalPrice = template.priceMultiplier >= 1.0
        ? Math.round(price * 1.15)
        : null;
      const arrivalTime   = addDuration(template.departureTime, duration);
      const availableSeats = Math.floor(Math.random() * 25) + 8; // 8–32

      // ── Insert trip ────────────────────────────────────────────
      const tripResult = await client.query(
        `INSERT INTO trips
           (bus_id, source, destination, departure_time, arrival_time,
            duration, price, original_price, travel_date,
            available_seats, rating, review_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          busId,
          source,
          destination,
          template.departureTime,
          arrivalTime,
          duration,
          price,
          originalPrice,
          date,
          availableSeats,
          template.rating,
          template.reviews,
        ]
      );

      const tripId = tripResult.rows[0].id;

      // ── Insert boarding points ─────────────────────────────────
      const boardingTime1 = template.departureTime;
      const boardingTime2 = addDuration(template.departureTime, '0h 30m');

      await client.query(
        `INSERT INTO boarding_points (trip_id, name, time, address)
         VALUES
           ($1, $2, $3, $4),
           ($1, $5, $6, $7)`,
        [
          tripId,
          `${source} Main Bus Stand`,
          boardingTime1,
          `Central Bus Station, ${source}`,
          `${source} City Center`,
          boardingTime2,
          `City Center Stop, ${source}`,
        ]
      );

      // ── Insert dropping points ─────────────────────────────────
      const droppingTime1 = arrivalTime;
      const droppingTime2 = addDuration(arrivalTime, '0h 30m');

      await client.query(
        `INSERT INTO dropping_points (trip_id, name, time, address)
         VALUES
           ($1, $2, $3, $4),
           ($1, $5, $6, $7)`,
        [
          tripId,
          `${destination} Bus Terminal`,
          droppingTime1,
          `Main Bus Terminal, ${destination}`,
          `${destination} City Center`,
          droppingTime2,
          `City Center, ${destination}`,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Generated trips: ${source} → ${destination} on ${date}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to generate trips:', err);
    throw err;
  } finally {
    client.release();
  }
};

/**
 * @swagger
 * /buses/{id}:
 *   get:
 *     tags: [Buses]
 *     summary: Get trip details by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip details
 *       404:
 *         description: Trip not found
 */
export const getTripById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT t.*, b.name AS bus_name, b.operator_name, b.bus_type,
              b.total_seats, b.amenities, b.cancellation_policy, b.refund_policy
       FROM trips t
       JOIN buses b ON b.id = t.bus_id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    const trip = result.rows[0];
    const [boarding, dropping] = await Promise.all([
      query('SELECT * FROM boarding_points WHERE trip_id = $1 ORDER BY time', [id]),
      query('SELECT * FROM dropping_points WHERE trip_id = $1 ORDER BY time', [id]),
    ]);

    res.json({
      success: true,
      data: {
        ...trip,
        boarding_points: boarding.rows,
        dropping_points: dropping.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};