import mongoose from "mongoose";


const bookingSchema= new mongoose.Schema({
    user:{type: String , required:true,ref:'User'},
    show:{type: String , required:true,ref:'Show'},
    amount:{type: Number , required:true},
    bookedSeats:{type: Array , required:true},
    customerEmail:{type:String},
    customerPhone:{type:String},
    isPaid:{type:Boolean , required:false},
    paymentLink:{type: String , default:false},
},{minimize: false,timestamps:true})


const Booking = mongoose.model("Booking",bookingSchema)


export default Booking;
