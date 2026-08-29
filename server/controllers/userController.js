/// api to cotrooll users ,bookings

import { clerkClient } from "@clerk/express";
import Booking from "../models/Booking.js";
import Movie from "../models/Movie.js";
import User from "../models/User.js";
import Show from "../models/Show.js";

export const syncCurrentUser = async (req, res) => {
  try {
    const userId = req.auth().userId;
    const user = await clerkClient.users.getUser(userId);

    const userData = {
      _id: user.id,
      email: user.emailAddresses?.[0]?.emailAddress || "",
      phone: user.phoneNumbers?.[0]?.phoneNumber || "",
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
      image: user.imageUrl || "",
    };

    await User.findByIdAndUpdate(user.id, userData, { upsert: true, new: true });

    res.json({ success: true });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const trackUserTime = async (req, res) => {
  try {
    const userId = req.auth().userId;
    const seconds = Math.min(Math.max(Number(req.body.seconds) || 0, 0), 300);

    if (seconds > 0) {
      await User.findByIdAndUpdate(userId, { $inc: { totalTimeSpent: seconds } });
    }

    res.json({ success: true });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getUserBookings = async (req,res)=>{

try {

    const user = req.auth().userId;
    const bookings = await Booking.find({user}).populate({
        path: "show",
        populate: {path: "movie"}
    }).sort({createdAt : -1})

    const now = new Date();
    const expiredUnpaidBookings = bookings.filter(
        (booking) => !booking.isPaid && booking.show?.showDateTime < now
    );

    await Promise.all(expiredUnpaidBookings.map(async (booking) => {
        const show = await Show.findById(booking.show._id);
        if (show) {
            booking.bookedSeats.forEach((seat) => {
                delete show.occupiedSeats[seat];
            });
            show.markModified('occupiedSeats');
            await show.save();
        }
        await Booking.findByIdAndDelete(booking._id);
    }));

    const activeBookings = bookings.filter(
        (booking) => booking.isPaid || booking.show?.showDateTime >= now
    );

    res.json({success:true,bookings: activeBookings})

} 

catch (error) {
    
console.log(error.message);
        res.json({success:false,message:error.message});


}

}


//fav user list in clerk meta data Update

export const UpdateFavorite = async (req, res) => {
  try {
    const { movieId } = req.body;
    const userId = req.auth().userId;

    const user = await clerkClient.users.getUser(userId);
    let favorites = user.privateMetadata.favorites || [];

    // Add or remove movieId
    if (!favorites.includes(movieId)) {
      favorites.push(movieId);
    } else {
      favorites = favorites.filter(item => item !== movieId);
    }

    // Save updated metadata
    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { favorites },
    });

    res.json({ success: true, message: "Favorite movies updated successfully" });

  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};


//list of favrait movies 


export const getFavorites = async (req, res) => {
    try {
        const user = await clerkClient.users.getUser(req.auth().userId)
        const favorites = user.privateMetadata.favorites || [];

        ///getting movies from data base
        const movies = await Movie.find({_id: {$in: favorites}})

        res.json({success:true,movies})

    }  catch (error) {
        console.log(error.message);
        res.json({success:false,message:error.message});
    }
}
