import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import sendEmail from "../configs/nodemailer.js";
import { autoCreateDailyShows } from "../services/autoShowService.js";

// Inngest client
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// 1. Create User
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk", triggers: { event: "webhook-integration/user.created" } },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url, phone_numbers } = event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      phone: phone_numbers?.[0]?.phone_number || "",
      name: `${first_name} ${last_name}`,
      image: image_url,
    };
    await User.create(userData);
  }
);

// 2. Update User
const syncUserUpdate = inngest.createFunction(
  { id: "update-user-from-clerk", triggers: { event: "webhook-integration/user.updated" } },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url, phone_numbers } = event.data;
    const userData = {
      email: email_addresses[0].email_address,
      phone: phone_numbers?.[0]?.phone_number || "",
      name: `${first_name} ${last_name}`,
      image: image_url,
    };
    await User.findByIdAndUpdate(id, userData);
  }
);

// 3. Delete User
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-from-clerk", triggers: { event: "webhook-integration/user.deleted" } },
  async ({ event }) => {
    await User.findByIdAndDelete(event.data.id);
  }
);


////to cancel boo and relese seat is booking after 10 min

const releaseSeatsAndDeleteBooking = inngest.createFunction(
  { id: 'release-seats-delete-booking', triggers: { event: "app/checkpayment" } },
  async ({ event, step }) => {
    const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);

    await step.sleepUntil('wait-for-10-minutes', tenMinutesLater);

    await step.run('check-payment-status', async () => {
      const bookingId = event.data.bookingId;
      const booking = await Booking.findById(bookingId)

      // If paym,ent is not made, release seasts and delete booking
if (booking && !booking.isPaid) {
  const show = await Show.findById(booking.show);

  if (!show) {
    await Booking.findByIdAndDelete(booking._id);
    return;
  }
  
  booking.bookedSeats.forEach((seat) => {
    delete show.occupiedSeats[seat];
  });

  show.markModified('occupiedSeats');
  await show.save();

  await Booking.findByIdAndDelete(booking._id);
}

    })
  })


// function to send mail

const sendBookingConfirmationEmail = inngest.createFunction(
  { id: "send-booking-confirmation-email", triggers: { event: "app/show.booked" } },
  async ({ event, step }) => {
    const { bookingId } = event.data;

    const booking = await Booking.findById(bookingId).populate({
      path: 'show',
      populate: { path: "movie", model: "Movie" }
    }).populate('user');

    if (!booking?.user?.email) return;

    await sendEmail({
      to:booking.user.email,
      subject:`Payment Confirmation:"${booking.show.movie.title}" booked!`,
      body: `
  <div style="font-family: Arial, sans-serif; line-height: 1.5;">
    <h2>Hi ${booking.user.name},</h2>
    <p>Your booking for <strong style="color: #F84565;">${booking.show.movie.title}</strong> is confirmed.</p>
    <p>
      <strong>Date:</strong> ${new Date(booking.show.showDateTime).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' })}<br/>
      <strong>Time:</strong> ${new Date(booking.show.showDateTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })}
    </p>
    <p>Enjoy the show! 🍿</p>
    <p>Thanks for booking with us!<br/>— QuickShow Team</p>
  </div>
`

    })
  }
)

const autoAddDailyNewMovieShows = inngest.createFunction(
  {
    id: "auto-add-daily-new-movie-shows",
    triggers: [{ cron: process.env.AUTO_SHOW_CRON || "30 0 * * *" }],
  },
  async ({ step }) => {
    return step.run("create-random-new-release-shows", async () => autoCreateDailyShows());
  }
)









export const functions = [syncUserCreation, syncUserUpdate, syncUserDeletion, releaseSeatsAndDeleteBooking,sendBookingConfirmationEmail, autoAddDailyNewMovieShows];
