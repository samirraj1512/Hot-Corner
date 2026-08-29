import {
  abortR2Upload,
  completeR2Upload,
  getR2UploadStatus,
  startR2Upload,
} from "../services/r2Storage.js";

const getUserId = (req) => req.auth?.().userId;

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  message: error.statusCode ? error.message : "Unable to complete the direct video upload.",
});

export const getDirectUploadStatus = (_req, res) => res.json({ success: true, ...getR2UploadStatus() });

export const startDirectUpload = async (req, res) => {
  try {
    const result = await startR2Upload({ ownerId: getUserId(req), file: req.body?.file });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

export const completeDirectUpload = async (req, res) => {
  try {
    const result = await completeR2Upload({
      ownerId: getUserId(req),
      uploadId: req.params.uploadId,
      parts: req.body?.parts,
      title: req.body?.title,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

export const cancelDirectUpload = async (req, res) => {
  try {
    await abortR2Upload({ ownerId: getUserId(req), uploadId: req.params.uploadId });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
};
