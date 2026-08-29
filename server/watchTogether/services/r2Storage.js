import { randomUUID } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import WatchUpload from "../models/WatchUpload.js";

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * 1024 * 1024;
const DEFAULT_PART_SIZE = 32 * MEBIBYTE;
const DEFAULT_MAX_FILE_SIZE = 10 * GIBIBYTE;
const MAX_R2_PARTS = 10_000;
const MAX_SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_UPLOAD_URL_SECONDS = 24 * 60 * 60;
const DEFAULT_UPLOAD_SESSION_HOURS = 24;

const MIME_BY_EXTENSION = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
};

let cachedClient = null;
let cachedClientKey = "";

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const cleanFileName = (value) => String(value || "")
  .trim()
  .replace(/[\\/\u0000-\u001f]+/g, " ")
  .replace(/\s+/g, " ")
  .slice(0, 240);

const getExtension = (name) => {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match?.[1] || "";
};

const getNumberFromEnv = (name, fallback, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) => {
  const configured = Number(process.env[name]);
  if (!Number.isFinite(configured)) return fallback;
  return Math.min(Math.max(configured, minimum), maximum);
};

const getMaxFileSize = () => getNumberFromEnv(
  "WATCH_TOGETHER_R2_MAX_FILE_SIZE_GB",
  DEFAULT_MAX_FILE_SIZE / GIBIBYTE,
  { minimum: 1, maximum: 1024 },
) * GIBIBYTE;

const getUploadUrlLifetime = () => Math.floor(getNumberFromEnv(
  "WATCH_TOGETHER_R2_UPLOAD_URL_TTL_SECONDS",
  DEFAULT_UPLOAD_URL_SECONDS,
  { minimum: 300, maximum: MAX_SIGNED_URL_SECONDS },
));

const getUploadSessionExpiry = () => new Date(Date.now() + getNumberFromEnv(
  "WATCH_TOGETHER_R2_UPLOAD_SESSION_HOURS",
  DEFAULT_UPLOAD_SESSION_HOURS,
  { minimum: 1, maximum: 168 },
) * 60 * 60 * 1000);

const getR2Config = () => {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = String(process.env.R2_BUCKET || "").trim();
  const missing = [
    !accountId && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !bucket && "R2_BUCKET",
  ].filter(Boolean);

  if (missing.length) return { configured: false, missing };
  return {
    configured: true,
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
};

const requireR2Config = () => {
  const config = getR2Config();
  if (!config.configured) {
    throw createHttpError(`Direct uploads need ${config.missing.join(", ")} in the server environment.`, 503);
  }
  return config;
};

const getClient = (config) => {
  const clientKey = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;
  if (cachedClient && cachedClientKey === clientKey) return cachedClient;

  cachedClient = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClientKey = clientKey;
  return cachedClient;
};

const normalizeUploadFile = (file = {}) => {
  const name = cleanFileName(file.name);
  const extension = getExtension(name);
  const size = Number(file.size);
  const contentType = String(file.type || "").toLowerCase().trim();
  const inferredType = MIME_BY_EXTENSION[extension] || "";
  const mimeType = inferredType || contentType;

  if (!name || !Number.isSafeInteger(size) || size < 1) {
    throw createHttpError("Choose a valid video file to upload.", 400);
  }
  if (size > getMaxFileSize()) {
    throw createHttpError(`This server currently allows direct uploads up to ${Math.floor(getMaxFileSize() / GIBIBYTE)} GB.`, 422);
  }
  if (extension && !MIME_BY_EXTENSION[extension]) {
    throw createHttpError("For synchronized playback, upload an H.264/AAC MP4, WebM, or Ogg video. MKV and HEVC files need conversion first.", 422);
  }
  if (!Object.values(MIME_BY_EXTENSION).includes(mimeType)) {
    throw createHttpError("For synchronized playback, upload an H.264/AAC MP4, WebM, or Ogg video. MKV and HEVC files need conversion first.", 422);
  }

  return {
    name,
    size,
    extension: extension === "m4v" ? "mp4" : extension,
    contentType: mimeType,
  };
};

const getPartSize = (size) => {
  const minimumForPartLimit = Math.ceil(size / MAX_R2_PARTS);
  return Math.max(DEFAULT_PART_SIZE, Math.ceil(minimumForPartLimit / MEBIBYTE) * MEBIBYTE);
};

const normalizeParts = (parts, expectedPartCount) => {
  if (!Array.isArray(parts) || parts.length !== expectedPartCount) {
    throw createHttpError("The direct upload did not finish every part. Try the upload again.", 400);
  }

  const seen = new Set();
  const normalized = parts.map((part) => {
    const partNumber = Number(part?.partNumber);
    const eTag = String(part?.eTag || "").trim();
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > expectedPartCount || seen.has(partNumber) || !eTag || eTag.length > 300) {
      throw createHttpError("The direct upload returned an invalid part.", 400);
    }
    seen.add(partNumber);
    return { PartNumber: partNumber, ETag: eTag };
  });

  return normalized.sort((left, right) => left.PartNumber - right.PartNumber);
};

const createPlaybackUrl = async (upload, config = requireR2Config()) => {
  const client = getClient(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: upload.objectKey }),
    { expiresIn: MAX_SIGNED_URL_SECONDS },
  );
};

const toMedia = async (upload, title) => ({
  source: "r2",
  r2UploadId: upload.id,
  title: String(title || upload.originalName).trim().slice(0, 160) || upload.originalName,
  url: await createPlaybackUrl(upload),
  mimeType: upload.contentType,
});

export const getR2UploadStatus = () => {
  const config = getR2Config();
  return {
    configured: config.configured,
    ...(config.configured ? {} : { message: `Direct uploads need ${config.missing.join(", ")} in the server environment.` }),
    maxFileSizeBytes: getMaxFileSize(),
    acceptedFormats: ["MP4 (H.264/AAC)", "WebM", "Ogg"],
  };
};

export const startR2Upload = async ({ ownerId, file }) => {
  const config = requireR2Config();
  const normalizedFile = normalizeUploadFile(file);
  const partSize = getPartSize(normalizedFile.size);
  const partCount = Math.ceil(normalizedFile.size / partSize);
  if (partCount > MAX_R2_PARTS) throw createHttpError("This file requires too many upload parts.", 422);

  const id = randomUUID();
  const objectKey = `watch-together/${id}.${normalizedFile.extension}`;
  const client = getClient(config);
  let storageUploadId = "";

  try {
    const started = await client.send(new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: normalizedFile.contentType,
      CacheControl: "private, max-age=0, no-store",
      Metadata: { watchTogether: "true" },
    }));
    storageUploadId = String(started.UploadId || "");
    if (!storageUploadId) throw new Error("R2 did not return an upload ID.");

    const upload = await WatchUpload.create({
      id,
      ownerId,
      objectKey,
      storageUploadId,
      originalName: normalizedFile.name,
      contentType: normalizedFile.contentType,
      size: normalizedFile.size,
      partSize,
      partCount,
      expiresAt: getUploadSessionExpiry(),
    });

    const expiresIn = getUploadUrlLifetime();
    const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => ({
      partNumber: index + 1,
      url: await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: config.bucket,
          Key: upload.objectKey,
          UploadId: upload.storageUploadId,
          PartNumber: index + 1,
        }),
        { expiresIn },
      ),
    })));

    return {
      uploadId: upload.id,
      partSize,
      partCount,
      expiresAt: upload.expiresAt,
      parts,
    };
  } catch (error) {
    if (storageUploadId) {
      await client.send(new AbortMultipartUploadCommand({
        Bucket: config.bucket,
        Key: objectKey,
        UploadId: storageUploadId,
      })).catch(() => undefined);
    }
    if (error.statusCode) throw error;
    console.error("Watch Together R2 upload start failed:", error.message);
    throw createHttpError("Could not start the direct video upload. Check the R2 credentials and bucket CORS settings.", 503);
  }
};

export const completeR2Upload = async ({ ownerId, uploadId, parts, title }) => {
  const id = String(uploadId || "").trim();
  const upload = await WatchUpload.findOne({
    id,
    ownerId,
    status: "uploading",
    expiresAt: { $gt: new Date() },
  });
  if (!upload) throw createHttpError("This upload session is unavailable. Start the upload again.", 404);

  const config = requireR2Config();
  const client = getClient(config);
  const completedParts = normalizeParts(parts, upload.partCount);

  try {
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: upload.objectKey,
      UploadId: upload.storageUploadId,
      MultipartUpload: { Parts: completedParts },
    }));
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: upload.objectKey }));
    if (Number(head.ContentLength) !== Number(upload.size)) {
      throw createHttpError("The uploaded video size did not match the original file. Start the upload again.", 422);
    }

    upload.status = "ready";
    upload.expiresAt = new Date(Date.now() + MAX_SIGNED_URL_SECONDS + 60 * 60 * 1000);
    await upload.save();
    return { media: await toMedia(upload, title) };
  } catch (error) {
    if (error.statusCode) throw error;
    console.error("Watch Together R2 upload completion failed:", error.message);
    throw createHttpError("The storage service could not complete this upload. Check the bucket CORS policy and try again.", 503);
  }
};

export const abortR2Upload = async ({ ownerId, uploadId }) => {
  const upload = await WatchUpload.findOne({ id: String(uploadId || "").trim(), ownerId, status: "uploading" });
  if (!upload) return;

  const config = requireR2Config();
  const client = getClient(config);
  await client.send(new AbortMultipartUploadCommand({
    Bucket: config.bucket,
    Key: upload.objectKey,
    UploadId: upload.storageUploadId,
  })).catch(() => undefined);
  upload.status = "aborted";
  await upload.save();
};

export const getCompletedR2Media = async ({ ownerId, uploadId, title }) => {
  const upload = await WatchUpload.findOne({
    id: String(uploadId || "").trim(),
    ownerId,
    status: "ready",
    expiresAt: { $gt: new Date() },
  });
  if (!upload) throw createHttpError("Select a completed direct upload before creating the room.", 400);
  return toMedia(upload, title);
};
