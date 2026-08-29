import mongoose from "mongoose";

const mediaSnapshotSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, maxlength: 32 },
    title: { type: String, required: true, maxlength: 160 },
  },
  { _id: false },
);

const watchRoomHistorySchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    code: { type: String, required: true, uppercase: true, index: true },
    hostId: { type: String, required: true, index: true },
    hostName: { type: String, required: true, maxlength: 80 },
    hostImage: { type: String, default: "", maxlength: 500 },
    media: { type: mediaSnapshotSchema, required: true },
    roomCreatedAt: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true, default: Date.now, index: true },
    lastActivityType: {
      type: String,
      enum: ["created", "joined", "watching", "left", "playback", "media_changed", "message"],
      default: "created",
    },
  },
  { timestamps: true },
);

watchRoomHistorySchema.index({ roomCreatedAt: -1 });
watchRoomHistorySchema.index({ lastActivityAt: -1 });

const WatchRoomHistory = mongoose.model("WatchRoomHistory", watchRoomHistorySchema);

export default WatchRoomHistory;
