import assert from "node:assert/strict";
import mongoose from "mongoose";
import "dotenv/config";
import connectDB from "../configs/db.js";
import {
  getAllBookings,
  getAllShows,
  getAllUsers,
  getDashboardData,
} from "../controllers/adminController.js";
import { deleteShow } from "../controllers/showController.js";
import Booking from "../models/Booking.js";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import User from "../models/User.js";

const runId = `ADMIN${Date.now().toString(36).toUpperCase()}`;
const ids = {
  user: `${runId}-USER`,
  movie: `${runId}-MOVIE`,
};

const invokeController = async (controller, { params = {} } = {}) => {
  let response;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      response = { statusCode: this.statusCode, body };
      return body;
    },
  };
  await controller({ params }, res);
  assert.ok(response, "Controller did not return JSON.");
  return response;
};

let paidShow;
let unpaidShow;

try {
  await connectDB();
  const future = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await User.create({
    _id: ids.user,
    name: "Admin Verification User",
    email: `${runId.toLowerCase()}@example.test`,
    image: "https://example.test/user.png",
  });
  await Movie.create({
    _id: ids.movie,
    title: "Admin Verification Movie",
    overview: "Admin verification data.",
    poster_path: "/admin-verification.jpg",
    backdrop_path: "/admin-verification-backdrop.jpg",
    release_date: "2026-01-01",
    genres: [],
    casts: [],
    vote_average: 7.5,
    runtime: 100,
  });
  [paidShow, unpaidShow] = await Show.create([
    { movie: ids.movie, showDateTime: future, showPrice: 15, occupiedSeats: {} },
    { movie: ids.movie, showDateTime: new Date(future.getTime() + 60 * 60 * 1000), showPrice: 15, occupiedSeats: {} },
  ]);
  await Booking.create([
    {
      user: ids.user,
      show: paidShow._id.toString(),
      amount: 30,
      bookedSeats: ["A1", "A2"],
      customerEmail: `${runId.toLowerCase()}@example.test`,
      isPaid: true,
    },
    {
      user: ids.user,
      show: paidShow._id.toString(),
      amount: 15,
      bookedSeats: ["B1"],
      isPaid: true,
    },
    {
      user: ids.user,
      show: unpaidShow._id.toString(),
      amount: 15,
      bookedSeats: ["C1"],
      isPaid: false,
    },
  ]);

  const showsResponse = await invokeController(getAllShows);
  assert.equal(showsResponse.statusCode, 200);
  const verifiedPaidShow = showsResponse.body.shows.find(
    (show) => show._id.toString() === paidShow._id.toString(),
  );
  assert.equal(verifiedPaidShow.paidBookingCount, 2);
  assert.equal(verifiedPaidShow.paidSeatCount, 3);
  assert.equal(verifiedPaidShow.totalRevenue, 45);

  const dashboardResponse = await invokeController(getDashboardData);
  assert.equal(dashboardResponse.statusCode, 200);
  assert.ok(dashboardResponse.body.dashboardData.totalBookings >= 2);
  assert.ok(dashboardResponse.body.dashboardData.totalRevenue >= 45);

  const bookingResponse = await invokeController(getAllBookings);
  assert.equal(bookingResponse.statusCode, 200);
  assert.ok(bookingResponse.body.bookings.some((booking) => booking.show?._id?.toString() === paidShow._id.toString()));

  const userResponse = await invokeController(getAllUsers);
  assert.equal(userResponse.statusCode, 200);
  const verifiedUser = userResponse.body.users.find((user) => user._id === ids.user);
  assert.equal(verifiedUser.totalPaid, 45);
  assert.equal(verifiedUser.email, `${runId.toLowerCase()}@example.test`);

  const blockedDelete = await invokeController(deleteShow, { params: { showId: paidShow._id.toString() } });
  assert.equal(blockedDelete.statusCode, 409);
  assert.ok(await Show.exists({ _id: paidShow._id }));

  const allowedDelete = await invokeController(deleteShow, { params: { showId: unpaidShow._id.toString() } });
  assert.equal(allowedDelete.statusCode, 200);
  assert.equal(await Show.exists({ _id: unpaidShow._id }), null);
  assert.equal(await Booking.countDocuments({ show: unpaidShow._id.toString() }), 0);

  console.log("Admin verification passed: dashboard, paid show statistics, bookings, users, and deletion protection.");
} finally {
  await Booking.deleteMany({ user: ids.user });
  await Show.deleteMany({ movie: ids.movie });
  await Movie.deleteOne({ _id: ids.movie });
  await User.deleteOne({ _id: ids.user });
  await mongoose.disconnect();
}
