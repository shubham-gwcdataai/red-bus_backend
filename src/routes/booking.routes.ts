import { Router } from 'express';
import { createBooking, getMyBookings, cancelBooking } from '../controllers/booking.controller';
import { protect }  from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { bookingSchema } from '../schemas/booking.schema';

const router = Router();

router.use(protect); // All booking routes need auth

router.post('/',            validate(bookingSchema), createBooking);
router.get ('/my',          getMyBookings);
router.put ('/:id/cancel',  cancelBooking);

export default router;