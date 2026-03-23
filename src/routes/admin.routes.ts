// ─── admin.routes.ts ─────────────────────────────────────────────
import { Router }      from 'express';
import { protect, adminOnly } from '../middleware/auth.middleware';
import {
  getStats, getAllBuses, createBus, updateBus, deleteBus,
  getAllTrips, createTrip, updateTrip, deleteTrip,
  getAllBookings, getAllUsers,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require valid JWT + admin role
router.use(protect, adminOnly);

router.get('/stats',           getStats);

router.get('/buses',           getAllBuses);
router.post('/buses',          createBus);
router.put('/buses/:id',       updateBus);
router.delete('/buses/:id',    deleteBus);

router.get('/trips',           getAllTrips);
router.post('/trips',          createTrip);
router.put('/trips/:id',       updateTrip);
router.delete('/trips/:id',    deleteTrip);

router.get('/bookings',        getAllBookings);
router.get('/users',           getAllUsers);

export default router;
