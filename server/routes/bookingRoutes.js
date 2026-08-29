import express from 'express'
import { createBooking, getOccupiedSeats } from '../controllers/bookingcontroller.js';

const bookingRouter = express.Router();

bookingRouter.post('/create',createBooking);
bookingRouter.get('/seats/:showId',getOccupiedSeats);

export default bookingRouter;