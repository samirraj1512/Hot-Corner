import mongoose from "mongoose";

const watchUploadSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    objectKey: { type: String, required: true, unique: true },
    storageUploadId: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 240 },
    contentType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 1 },
    partSize: { type: Number, required: true, min: 5 * 1024 * 1024 },
    partCount: { type: Number, required: true, min: 1, max: 10_000 },
    status: { type: String, enum: ["uploading", "ready", "aborted"], default: "uploading", index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// This expires stale upload sessions. Configure the R2 bucket lifecycle to remove matching objects too.
watchUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const WatchUpload = mongoose.model("WatchUpload", watchUploadSchema);

export default WatchUpload;
