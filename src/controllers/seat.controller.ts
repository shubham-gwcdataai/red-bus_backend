import { Request, Response, NextFunction } from 'express';
import { query } from '../config/db';

/**
 * @swagger
 * /buses/{tripId}/seats:
 *   get:
 *     tags: [Seats]
 *     summary: Get seat layout for a trip
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seat layout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Seat'
 *       404:
 *         description: Trip not found
 */
export const getSeatsByTrip = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ✅ FIX: cast to string — Express params are always string at runtime
    const tripId = req.params.tripId as string;

    // Verify trip exists
    const tripCheck = await query(
      'SELECT id FROM trips WHERE id = $1',
      [tripId]
    );

    if (tripCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    // Check if seats already exist for this trip
    const existing = await query(
      'SELECT COUNT(*) FROM seats WHERE trip_id = $1',
      [tripId]
    );

    if (parseInt(existing.rows[0].count) === 0) {
      // Auto-generate seats if none exist
      await generateSeats(tripId);
    }

    const seats = await query(
      `SELECT * FROM seats
       WHERE trip_id = $1
       ORDER BY deck, row_num, col_num`,
      [tripId]
    );

    res.json({ success: true, data: seats.rows });
  } catch (err) {
    next(err);
  }
};

// ─── Auto-generate 2+2 seat layout (lower + upper deck) ──────────
const generateSeats = async (tripId: string): Promise<void> => {
  const priceResult = await query(
    'SELECT price FROM trips WHERE id = $1',
    [tripId]
  );
  const basePrice = parseFloat(priceResult.rows[0]?.price ?? 899);

  const values:    unknown[] = [];
  const sqlParts:  string[]  = [];
  let   paramIdx             = 1;

  const decks = ['lower', 'upper'] as const;

  for (const deck of decks) {
    // Upper deck is slightly cheaper
    const deckPrice = deck === 'upper' ? basePrice - 50 : basePrice;

    for (let row = 1; row <= 5; row++) {
      // Layout: col 0,1 = left | col 3,4 = right | col 2 = aisle (skip)
      for (const col of [0, 1, 3, 4]) {
        const side      = col < 2 ? 'A' : 'B';
        const seatIndex = col % 3 === 0 ? 1 : 2;
        const prefix    = deck === 'lower' ? 'L' : 'U';
        const seatNum   = `${prefix}${row}${side}${seatIndex}`;

        // Ladies seat: lower deck, row 1, first seat
        const isLadies = deck === 'lower' && row === 1 && col === 0;

        // Randomly mark ~35% of seats as already booked (realistic demo)
        const status = Math.random() < 0.35 ? 'booked' : 'available';

        // Normalize col to 0-3 range for storage
        const storedCol = col < 2 ? col : col - 1;

        sqlParts.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );

        values.push(
          tripId,
          seatNum,
          deck,
          status,
          deckPrice,
          isLadies,
          row,
          storedCol
        );
      }
    }
  }

  await query(
    `INSERT INTO seats
       (trip_id, seat_number, deck, status, price, is_ladies, row_num, col_num)
     VALUES ${sqlParts.join(', ')}`,
    values
  );
};