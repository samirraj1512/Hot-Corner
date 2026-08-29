import mongoose from "mongoose";

const playbackSchema = new mongoose.Schema(
  {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const mediaSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ["youtube", "drive", "cloudinary", "r2"], required: true },
    title: { type: String, required: true, maxlength: 160 },
    url: { type: String, required: true },
    previewUrl: { type: String },
    thumbnail: { type: String },
    youtubeId: { type: String },
    driveFileId: { type: String },
    resourceKey: { type: String },
    cloudinaryPublicId: { type: String },
    r2UploadId: { type: String },
    mimeType: { type: String },
  },
  { _id: false },
);

const chatMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 80 },
    image: { type: String, default: "", maxlength: 500 },
    text: { type: String, required: true, maxlength: 500 },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const watchRoomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    hostId: { type: String, required: true, index: true },
    hostName: { type: String, required: true, maxlength: 80 },
    hostImage: { type: String, default: "" },
    controllers: { type: [String], default: [] },
    media: { type: mediaSchema, required: true },
    playback: { type: playbackSchema, default: () => ({}) },
    messages: { type: [chatMessageSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Expired rooms are removed by MongoDB's TTL monitor without retaining old links forever.
watchRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const WatchRoom = mongoose.model("WatchRoom", watchRoomSchema);

export default WatchRoom;
