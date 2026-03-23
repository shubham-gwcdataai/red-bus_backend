import { Router } from 'express';
import { searchBuses, getTripById } from '../controllers/bus.controller';
import { getSeatsByTrip }           from '../controllers/seat.controller';

const router = Router();

router.get('/search',        searchBuses);
router.get('/:id',           getTripById);
router.get('/:tripId/seats', getSeatsByTrip);

export default router;