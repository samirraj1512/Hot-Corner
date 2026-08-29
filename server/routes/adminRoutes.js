import express from "express"
import { protectAdmin } from "../middleware/auth.js";
import { getAllBookings, getAllShows, getAllUsers, getDashboardData, isAdmin } from "../controllers/adminController.js";
import { getWatchTogetherAdminOverview, getWatchTogetherRoomDetail } from "../watchTogether/controllers/adminController.js";

const adminRouter = express.Router();

adminRouter.get('/is-admin',protectAdmin,isAdmin)
adminRouter.get('/dashboard',protectAdmin,getDashboardData)
adminRouter.get('/all-shows',protectAdmin,getAllShows)
adminRouter.get('/all-bookings',protectAdmin,getAllBookings)
adminRouter.get('/all-users',protectAdmin,getAllUsers)
adminRouter.get('/watch-together', protectAdmin, getWatchTogetherAdminOverview)
adminRouter.get('/watch-together/rooms/:roomId', protectAdmin, getWatchTogetherRoomDetail)


export default adminRouter
