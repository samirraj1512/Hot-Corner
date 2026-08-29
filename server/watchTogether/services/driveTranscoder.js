import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { cleanMediaTitle, createValidationError, normalizeMedia } from "../utils/roomUtils.js";

const CLOUDINARY_FOLDER = "hot-corner/watch-together";
const CLOUDINARY_PUBLIC_ID_PATTERN = /^hot-corner\/watch-together\/[A-Za-z0-9_-]{8,120}$/;
const DIRECT_BROWSER_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const DIRECT_BROWSER_EXTENSIONS = /\.(mp4|webm)$/i;

const createServiceError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isPendingCloudinaryError = (error) => [404, 420, 423].includes(Number(error?.http_code));

const createCloudinaryError = (error, action) => {
  const statusCode = Number(error?.http_code) || 0;
  const message = String(error?.message || "");
  const normalizedMessage = message.toLowerCase();

  console.error(`Watch Together Cloudinary ${action} failed (${statusCode || "unknown"}):`, message);

  if (statusCode === 401 || statusCode === 403 || /api key|authorization|credential/.test(normalizedMessage)) {
    return createServiceError(
      "Cloudinary rejected the server credentials. Check the Cloudinary environment variables in the hotcorner-server Vercel project and redeploy it.",
      502,
    );
  }

  if (statusCode === 413 || /file size|too large|size limit|maximum.*size|exceeds.*limit/.test(normalizedMessage)) {
    return createServiceError(
      "This Drive video is larger than the current Cloudinary plan can convert. Use a browser-compatible H.264/AAC MP4 from Google Drive, or use a media plan that supports multi-gigabyte conversion.",
      422,
    );
  }

  if (/remote|fetch|download|url/.test(normalizedMessage)) {
    return createServiceError(
      "Cloudinary could not download this Drive video. Confirm that anyone with the room link can view the file, then try again.",
      502,
    );
  }

  return createServiceError(
    "Cloudinary could not process this Drive video. Check the provider's file-size limit and try a browser-compatible MP4/WebM file.",
    502,
  );
};

const getDriveDownloadUrl = (driveFileId, resourceKey = "") => {
  const params = new URLSearchParams({ id: driveFileId, export: "download", confirm: "t" });
  if (resourceKey) params.set("resourcekey", resourceKey);
  return `https://drive.usercontent.google.com/download?${params}`;
};

export const isDirectBrowserVideo = (media) => {
  const mimeType = String(media?.mimeType || "").toLowerCase();
  const title = String(media?.title || "");
  return DIRECT_BROWSER_MIME_TYPES.has(mimeType) || DIRECT_BROWSER_EXTENSIONS.test(title);
};

export const createCloudinaryWatchMedia = ({ publicId, title, eager }) => {
  const mp4 = eager?.find((asset) => asset?.format === "mp4" && asset?.secure_url);
  if (!mp4?.secure_url) return null;

  return {
    source: "cloudinary",
    cloudinaryPublicId: publicId,
    title: cleanMediaTitle(title, "Shared video"),
    url: mp4.secure_url,
    thumbnail: "",
    mimeType: "video/mp4",
  };
};

const isCloudinaryReady = (client) => {
  const configuration = client.config();
  return Boolean(configuration.cloud_name && configuration.api_key && configuration.api_secret);
};

export const createDriveTranscoder = ({ client = cloudinary } = {}) => {
  const cloudinaryOverrides = { secure: true };
  if (process.env.CLOUDINARY_CLOUD_NAME) cloudinaryOverrides.cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  if (process.env.CLOUDINARY_API_KEY) cloudinaryOverrides.api_key = process.env.CLOUDINARY_API_KEY;
  if (process.env.CLOUDINARY_API_SECRET) cloudinaryOverrides.api_secret = process.env.CLOUDINARY_API_SECRET;
  client.config(cloudinaryOverrides);

  const ensureConfigured = () => {
    if (!isCloudinaryReady(client)) {
      throw createServiceError(
        "This Drive video needs conversion before browsers can synchronize it. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to the server environment, then try again.",
        503,
      );
    }
  };

  const prepare = async (mediaInput, { forceTranscode = false } = {}) => {
    const media = normalizeMedia(mediaInput);
    if (media.source !== "drive") throw createValidationError("Only Google Drive videos can be prepared for synchronized playback.");
    if (!forceTranscode && isDirectBrowserVideo(media)) return { status: "ready", media };

    ensureConfigured();
    const publicId = `${CLOUDINARY_FOLDER}/${randomUUID().replace(/-/g, "")}`;
    const upload = client.uploader.upload_large || client.uploader.upload;
    try {
      await upload.call(client.uploader, getDriveDownloadUrl(media.driveFileId, media.resourceKey), {
        resource_type: "video",
        public_id: publicId,
        overwrite: false,
        chunk_size: 20_000_000,
        eager: [{ format: "mp4", video_codec: "h264", audio_codec: "aac", flags: "progressive" }],
        eager_async: true,
        async: true,
      });
    } catch (error) {
      throw createCloudinaryError(error, "upload");
    }

    return {
      status: "processing",
      publicId,
      title: media.title,
    };
  };

  const getStatus = async ({ publicId, title }) => {
    if (!CLOUDINARY_PUBLIC_ID_PATTERN.test(String(publicId || ""))) {
      throw createValidationError("The media conversion job is invalid.");
    }
    ensureConfigured();

    let resource;
    try {
      resource = await client.api.resource(publicId, { resource_type: "video", eager: true });
    } catch (error) {
      if (isPendingCloudinaryError(error)) return { status: "processing" };
      throw createCloudinaryError(error, "status check");
    }

    const media = createCloudinaryWatchMedia({ publicId, title, eager: resource.eager });
    return media ? { status: "ready", media } : { status: "processing" };
  };

  return { prepare, getStatus, isConfigured: () => isCloudinaryReady(client) };
};

export const driveTranscoder = createDriveTranscoder();
