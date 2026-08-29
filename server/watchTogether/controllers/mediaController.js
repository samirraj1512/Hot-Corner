import { driveTranscoder } from "../services/driveTranscoder.js";

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  message: error.statusCode ? error.message : "Unable to prepare that video for Watch Together.",
});

export const prepareWatchMedia = async (req, res) => {
  try {
    const result = await driveTranscoder.prepare(req.body?.media, {
      forceTranscode: req.body?.forceTranscode === true,
    });
    return res.status(result.status === "processing" ? 202 : 200).json({ success: true, ...result });
  } catch (error) {
    console.error("Watch media preparation failed:", error.message);
    return sendError(res, error);
  }
};

export const getPreparedWatchMedia = async (req, res) => {
  try {
    const result = await driveTranscoder.getStatus({
      publicId: req.query.publicId,
      title: req.query.title,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};
