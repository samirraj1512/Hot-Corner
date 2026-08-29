const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYBACK_SECONDS = 24 * 60 * 60;
const getDriveStreamUrl = (driveFileId, resourceKey = "") => {
  const params = new URLSearchParams({ id: driveFileId, export: "download", confirm: "t" });
  if (resourceKey) params.set("resourcekey", resourceKey);
  return `https://drive.usercontent.google.com/download?${params}`;
};

const cleanDriveResourceKey = (value) => {
  const resourceKey = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,200}$/.test(resourceKey) ? resourceKey : "";
};

export const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

export const normalizeRoomCode = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(0, 12);

export const createRoomCode = (length = 8) => Array.from(
  { length },
  () => ROOM_CODE_CHARACTERS[Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)],
).join("");

export const cleanDisplayName = (value, fallback = "Movie fan") => {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  return name || fallback;
};

export const cleanImageUrl = (value) => {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url.slice(0, 500) : "";
};

export const cleanMediaTitle = (value, fallback) => {
  const title = String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
  return title || fallback;
};

export const parseYoutubeId = (value) => {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    let id = "";

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      id = url.searchParams.get("v") || "";
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1] || "";
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
};

export const parseDriveFileId = (value) => {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;

  const match = raw.match(/\/d\/([A-Za-z0-9_-]{10,})/) || raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return match?.[1] || "";
};

const isGoogleDriveUrl = (value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "drive.google.com"
      || host.endsWith(".googleusercontent.com")
      || host.endsWith(".usercontent.google.com");
  } catch {
    return false;
  }
};

const isCloudinaryVideoUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && /^\/[^/]+\/video\/upload\//.test(url.pathname);
  } catch {
    return false;
  }
};

export const normalizePlayback = (value = {}) => {
  const currentTime = Number(value.currentTime);
  if (!Number.isFinite(currentTime) || currentTime < 0 || currentTime > MAX_PLAYBACK_SECONDS) {
    throw createValidationError("Playback time is invalid.");
  }

  if (typeof value.isPlaying !== "boolean") {
    throw createValidationError("Playback state is invalid.");
  }

  return {
    isPlaying: value.isPlaying,
    currentTime: Number(currentTime.toFixed(3)),
    updatedAt: new Date(),
  };
};

export const normalizeMedia = (value = {}) => {
  const source = String(value.source || "").toLowerCase();

  if (source === "youtube") {
    const youtubeId = parseYoutubeId(value.youtubeId || value.url);
    if (!youtubeId) throw createValidationError("Enter a valid YouTube video link.");

    return {
      source,
      youtubeId,
      title: cleanMediaTitle(value.title, "YouTube video"),
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  if (source === "drive") {
    const driveFileId = parseDriveFileId(value.driveFileId || value.url);
    if (!driveFileId) throw createValidationError("Select a Google Drive video first.");

    const suppliedUrl = String(value.url || "").trim();
    const suppliedThumbnail = String(value.thumbnail || "").trim();
    const resourceKey = cleanDriveResourceKey(value.resourceKey);

    return {
      source,
      driveFileId,
      resourceKey,
      title: cleanMediaTitle(value.title, "Google Drive video"),
      url: isGoogleDriveUrl(suppliedUrl)
        ? suppliedUrl.slice(0, 1500)
        : getDriveStreamUrl(driveFileId, resourceKey),
      previewUrl: `https://drive.google.com/file/d/${driveFileId}/preview`,
      thumbnail: isGoogleDriveUrl(suppliedThumbnail) ? suppliedThumbnail.slice(0, 1500) : "",
      mimeType: String(value.mimeType || "").startsWith("video/") ? value.mimeType.slice(0, 120) : "",
    };
  }

  if (source === "cloudinary") {
    const url = String(value.url || "").trim();
    const publicId = String(value.cloudinaryPublicId || "").trim();
    if (!isCloudinaryVideoUrl(url) || !/^hot-corner\/watch-together\/[A-Za-z0-9_-]{8,120}$/.test(publicId)) {
      throw createValidationError("The prepared video is invalid.");
    }

    return {
      source,
      cloudinaryPublicId: publicId,
      title: cleanMediaTitle(value.title, "Shared video"),
      url: url.slice(0, 1500),
      thumbnail: "",
      mimeType: "video/mp4",
    };
  }

  if (source === "r2") {
    const uploadId = String(value.r2UploadId || "").trim();
    const url = String(value.url || "").trim();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(uploadId) || !/^https:\/\//i.test(url)) {
      throw createValidationError("The direct upload is invalid. Upload the video again.");
    }

    return {
      source,
      r2UploadId: uploadId,
      title: cleanMediaTitle(value.title, "Shared upload"),
      url: url.slice(0, 5000),
      thumbnail: "",
      mimeType: String(value.mimeType || "").startsWith("video/") ? value.mimeType.slice(0, 120) : "video/mp4",
    };
  }

  throw createValidationError("Choose YouTube, Google Drive, or a direct upload.");
};

export const getRoomExpiryDate = () => {
  const configuredHours = Number(process.env.WATCH_ROOM_TTL_HOURS || 24);
  const hours = Number.isFinite(configuredHours)
    ? Math.min(Math.max(configuredHours, 1), 168)
    : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};
