import mongoose from "mongoose";

const watchRoomSessionSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    roomCode: { type: String, required: true, uppercase: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true, maxlength: 80 },
    userImage: { type: String, default: "", maxlength: 500 },
    joinedAt: { type: Date, required: true, default: Date.now, index: true },
    lastSeenAt: { type: Date, required: true, default: Date.now, index: true },
    endedAt: { type: Date, default: null, index: true },
    watchSeconds: { type: Number, default: 0, min: 0 },
    connectionCount: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

watchRoomSessionSchema.index({ roomId: 1, joinedAt: -1 });
watchRoomSessionSchema.index({ userId: 1, joinedAt: -1 });

// One active room session is kept per person. Reconnecting within the presence
// grace period updates this same session instead of creating false extra visits.
watchRoomSessionSchema.index(
  { roomId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { endedAt: null } },
);

const WatchRoomSession = mongoose.model("WatchRoomSession", watchRoomSessionSchema);

export default WatchRoomSession;
