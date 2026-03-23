import { z } from 'zod';

// ─── Booking Schema — compatible with Zod v3 and v4 ──────────────
export const bookingSchema = z.object({
  tripId:          z.string().uuid('Invalid trip ID'),
  boardingPointId: z.string().uuid('Invalid boarding point ID'),
  droppingPointId: z.string().uuid('Invalid dropping point ID'),
  contactEmail:    z.string().email('Invalid email address'),
  contactPhone:    z.string().min(10).max(15),
  totalAmount:     z.number().positive('Amount must be positive'),
  selectedSeats:   z.array(z.string()).min(1, 'Select at least one seat'),
  passengers: z.array(
    z.object({
      name:        z.string().min(2, 'Name must be at least 2 characters'),
      age:         z.number().int().min(1).max(120),
      gender:      z.enum(['Male', 'Female', 'Other']),
      seatNumber:  z.string().min(1),
    })
  ).min(1, 'At least one passenger is required'),
});

// ─── Payment Schema ───────────────────────────────────────────────
export const paymentOrderSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id:   z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature:  z.string().min(1),
  bookingData: z.object({
    busId:           z.string(),
    boardingPointId: z.string(),
    droppingPointId: z.string(),
    contactEmail:    z.string().email(),
    contactPhone:    z.string(),
    totalAmount:     z.number(),
    selectedSeats:   z.array(z.string()),
    passengers:      z.array(z.object({
      name:       z.string(),
      age:        z.number(),
      gender:     z.enum(['Male', 'Female', 'Other']),
      seatNumber: z.string(),
    })),
  }),
});

export type BookingInput       = z.infer<typeof bookingSchema>;
export type PaymentOrderInput  = z.infer<typeof paymentOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
