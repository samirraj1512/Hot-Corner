import express from "express";
import {
  createWatchRoom,
  getWatchRoom,
  joinWatchRoom,
  updateRoomController,
  updateRoomMedia,
  updateRoomPlayback,
} from "../controllers/roomController.js";
import { getWatchTogetherIceServers } from "../controllers/iceController.js";
import { getPreparedWatchMedia, prepareWatchMedia } from "../controllers/mediaController.js";
import {
  cancelDirectUpload,
  completeDirectUpload,
  getDirectUploadStatus,
  startDirectUpload,
} from "../controllers/r2Controller.js";

const watchTogetherRouter = express.Router();

const requireWatchTogetherUser = (req, res, next) => {
  try {
    const userId = req.auth?.().userId;
    if (!userId) return res.status(401).json({ success: false, message: "Please sign in to use Watch Together." });
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Please sign in to use Watch Together." });
  }
};

watchTogetherRouter.use(requireWatchTogetherUser);
watchTogetherRouter.get("/ice-servers", getWatchTogetherIceServers);
watchTogetherRouter.post("/media/prepare", prepareWatchMedia);
watchTogetherRouter.get("/media/prepare", getPreparedWatchMedia);
watchTogetherRouter.get("/r2/status", getDirectUploadStatus);
watchTogetherRouter.post("/r2/uploads", startDirectUpload);
watchTogetherRouter.post("/r2/uploads/:uploadId/complete", completeDirectUpload);
watchTogetherRouter.delete("/r2/uploads/:uploadId", cancelDirectUpload);
watchTogetherRouter.post("/rooms", createWatchRoom);
watchTogetherRouter.get("/rooms/:roomCode", getWatchRoom);
watchTogetherRouter.post("/rooms/:roomCode/join", joinWatchRoom);
watchTogetherRouter.patch("/rooms/:roomCode/playback", updateRoomPlayback);
watchTogetherRouter.patch("/rooms/:roomCode/media", updateRoomMedia);
watchTogetherRouter.patch("/rooms/:roomCode/controllers", updateRoomController);

export default watchTogetherRouter;
