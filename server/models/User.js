import mongoose, { Schema } from "mongoose";

const userSchema =new mongoose.Schema({
    _id:{type: String, required:true},
    name: {type: String, required:true},
    email:{type: String, required:true},
    phone:{type: String},
    totalTimeSpent:{type: Number, default:0},
    image:{type: String, required:true}
},{ timestamps: true })


const User = mongoose.model('User',userSchema)

export default User;
