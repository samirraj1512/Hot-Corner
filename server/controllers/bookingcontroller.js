// fuction of check avalable bity of selected seats


import Show from "../models/Show.js"
import Booking from "../models/Booking.js";
import User from "../models/User.js";

import  { Stripe } from 'stripe'
import { inngest } from "../inngest/index.js";

const checkSeatsAvailability = async (showId,selectedSeats)=>{
    try {
        
    const showData = await Show.findById(showId)

    if(!showData) return false;

    const occupiedSeats = showData.occupiedSeats;

    const isAnySeatTaken= selectedSeats.some(seat=>occupiedSeats[seat]);

    return !isAnySeatTaken;
    


    } 
    
    
    
    catch (error) {
        console.error(error);
        return false;
        
    }
}

export const createBooking = async(req,res)=>{

    try {
    
        const {userId}=req.auth();
        const{showId,selectedSeats}= req.body;
        const {origin} = req.headers;
        const userData = await User.findById(userId);

        // check seats are available for selected show

        const isAvailable = await checkSeatsAvailability(showId,selectedSeats);

        if(!isAvailable){
            return res.json({success:false,message:"Selected seats are not available"})
        }
        //get the show details

        const showData = await Show.findById(showId).populate('movie');

        //create a new bookings

        const booking = await Booking.create({
            user:userId,
            show:showId,
            amount: showData.showPrice*selectedSeats.length,
            bookedSeats: selectedSeats
        })

            selectedSeats.map((seat)=>{
                showData.occupiedSeats[seat]=userId;

            })
            showData.markModified('occupiedSeats')

            await showData.save();

                // Stripe Gateway Initialize
const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

// Creating line items for Stripe
const line_items = [{
  price_data: {
    currency: 'usd',
    product_data: {
      name: showData.movie.title,
    },
    unit_amount: Math.floor(booking.amount) * 100, // Stripe expects amount in cents
  },
  quantity: 1,
}];

// Create checkout session
const session = await stripeInstance.checkout.sessions.create({
  payment_method_types: ['card'],
  mode: 'payment',
  line_items,
  customer_email: userData?.email,
  phone_number_collection: {
    enabled: true,
  },
  success_url: `${origin}/loading/my-bookings`,
  cancel_url: `${origin}/my-bookings`,

  metadata:{
    bookingId: booking._id.toString()
  },
  expires_at:Math.floor(Date.now()/1000)+30*60,
});

booking.paymentLink= session.url
await booking.save()

//triggre the even to check pament sttus and relese seat if not

await inngest.send({
  name:"app/checkpayment",
  data:{
    bookingId:booking._id.toString()
  }
})


                res.json({success:true, url:session.url})


    } 
    
    catch (error) {

        console.log(error.message);
        res.json({success:false,message:error.message})
        
    }
}




//occupied seats data

export const getOccupiedSeats =async (req,res)=>{
    try {

            const{showId} = req.params;
            const showData = await Show.findById(showId)

            if(!showData){
                return res.status(404).json({success:false,message:"Show not found"})
            }

            const occupiedSeats= Object.keys(showData.occupiedSeats)

            res.json ({ success:true , occupiedSeats})
        
    } 
    
    
    
    catch (error) {
         console.log(error.message);
        res.json({success:false,message:error.message})
        
    }
}

