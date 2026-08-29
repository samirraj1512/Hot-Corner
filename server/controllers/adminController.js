import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import User from "../models/User.js";

const sendAdminError = (res, label, error) => {
  console.error(label, error.message);
  return res.status(500).json({ success: false, message: "Could not load admin data. Please try again." });
};

const getPaidBookingStatsByShow = async (showIds) => {
  if (!showIds.length) return new Map();

  const stats = await Booking.aggregate([
    { $match: { isPaid: true, show: { $in: showIds } } },
    {
      $group: {
        _id: "$show",
        paidBookingCount: { $sum: 1 },
        paidSeatCount: { $sum: { $size: { $ifNull: ["$bookedSeats", []] } } },
        totalRevenue: { $sum: "$amount" },
      },
    },
  ]);

  return new Map(stats.map((stat) => [String(stat._id), {
    paidBookingCount: stat.paidBookingCount,
    paidSeatCount: stat.paidSeatCount,
    totalRevenue: stat.totalRevenue,
  }]));
};

export const isAdmin = async (_req, res) => res.json({ success: true, isAdmin: true });

export const getDashboardData = async (_req, res) => {
  try {
    const [bookingTotals, activeShows, totalUsers] = await Promise.all([
      Booking.aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, totalBookings: { $sum: 1 }, totalRevenue: { $sum: "$amount" } } },
      ]),
      Show.find({ showDateTime: { $gte: new Date() } })
        .populate("movie")
        .sort({ showDateTime: 1 }),
      User.countDocuments(),
    ]);

    const totals = bookingTotals[0] || {};
    return res.json({
      success: true,
      dashboardData: {
        totalBookings: Number(totals.totalBookings || 0),
        totalRevenue: Number(totals.totalRevenue || 0),
        activeShows,
        totalUsers,
      },
    });
  } catch (error) {
    return sendAdminError(res, "Could not load admin dashboard:", error);
  }
};

export const getAllShows = async (_req, res) => {
  try {
    const shows = await Show.find({ showDateTime: { $gte: new Date() } })
      .populate("movie")
      .sort({ showDateTime: 1 });
    const showIds = shows.map((show) => show._id.toString());
    const statsByShow = await getPaidBookingStatsByShow(showIds);

    const enrichedShows = shows.map((show) => {
      const stats = statsByShow.get(show._id.toString()) || {};
      return {
        ...show.toObject(),
        paidBookingCount: Number(stats.paidBookingCount || 0),
        paidSeatCount: Number(stats.paidSeatCount || 0),
        totalRevenue: Number(stats.totalRevenue || 0),
      };
    });

    return res.json({ success: true, shows: enrichedShows });
  } catch (error) {
    return sendAdminError(res, "Could not load admin shows:", error);
  }
};

export const getAllBookings = async (_req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate("user")
      .populate({ path: "show", populate: { path: "movie" } })
      .sort({ createdAt: -1 });

    return res.json({ success: true, bookings });
  } catch (error) {
    return sendAdminError(res, "Could not load admin bookings:", error);
  }
};

export const getAllUsers = async (_req, res) => {
  try {
    const [users, bookingTotals] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }),
      Booking.aggregate([
        { $match: { isPaid: true } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$user",
            totalPaid: { $sum: "$amount" },
            customerEmail: { $first: "$customerEmail" },
            customerPhone: { $first: "$customerPhone" },
          },
        },
      ]),
    ]);

    const totalsByUser = new Map(bookingTotals.map((total) => [String(total._id), total]));
    const usersData = users.map((user) => {
      const totals = totalsByUser.get(user._id.toString()) || {};
      return {
        _id: user._id,
        name: user.name,
        email: user.email || totals.customerEmail || "",
        phone: user.phone || totals.customerPhone || "",
        totalPaid: Number(totals.totalPaid || 0),
        totalTimeSpent: Number(user.totalTimeSpent || 0),
        createdAt: user.createdAt || null,
      };
    });

    return res.json({ success: true, users: usersData });
  } catch (error) {
    return sendAdminError(res, "Could not load admin users:", error);
  }
};
