export const MAX_GOOGLE_DRIVE_FILE_SIZE = 5 * 1024 * 1024 * 1024;
export const MAX_SMOOTH_SYNC_DRIFT_SECONDS = 30;

const DRIFT_CORRECTION_THRESHOLD_SECONDS = 0.35;

export const extractYouTubeId = (value) => {
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

export const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

export const getGoogleDriveStreamUrl = (driveFileId, resourceKey = "") => {
  const params = new URLSearchParams({ id: driveFileId, export: "download", confirm: "t" });
  if (resourceKey) params.set("resourcekey", resourceKey);
  return `https://drive.usercontent.google.com/download?${params}`;
};

const getDriveResourceKeyFromUrl = (url) => {
  try {
    return new URL(url).searchParams.get("resourcekey") || "";
  } catch {
    return "";
  }
};

export const getGoogleDriveStreamCandidates = ({ driveFileId, resourceKey, url }) => {
  const fileId = String(driveFileId || "").trim();
  const resolvedResourceKey = String(resourceKey || getDriveResourceKeyFromUrl(url)).trim();
  const resourceKeyParameter = resolvedResourceKey ? `&resourcekey=${encodeURIComponent(resolvedResourceKey)}` : "";
  return [...new Set([
    url,
    fileId && getGoogleDriveStreamUrl(fileId, resolvedResourceKey),
    fileId && `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}${resourceKeyParameter}`,
  ].filter(Boolean))];
};

export const toDriveMedia = (file) => ({
  source: "drive",
  driveFileId: file.id,
  resourceKey: file.resourceKey || "",
  title: file.name,
  url: file.webContentLink || getGoogleDriveStreamUrl(file.id, file.resourceKey),
  thumbnail: file.thumbnailLink || "",
  mimeType: file.mimeType || "",
});

export const getPlaybackTime = (playback) => {
  if (!playback) return 0;
  const baseTime = Number(playback.currentTime || 0);
  if (!playback.isPlaying || !playback.updatedAt) return baseTime;

  const updatedAt = new Date(playback.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return baseTime;

  const elapsedSeconds = Math.max(0, (Date.now() - updatedAt) / 1000);
  return baseTime + elapsedSeconds;
};

export const getPlaybackSyncPlan = ({ playback, localTime, duration, forceSync = false }) => {
  const maximumTime = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  const targetTime = Math.min(Math.max(getPlaybackTime(playback), 0), maximumTime);
  const currentTime = Math.max(0, Number(localTime) || 0);
  const drift = targetTime - currentTime;
  const absoluteDrift = Math.abs(drift);

  if (!playback?.isPlaying) {
    return { targetTime, drift, shouldSeek: absoluteDrift > 0.15, playbackRate: 1 };
  }

  if (forceSync || absoluteDrift > MAX_SMOOTH_SYNC_DRIFT_SECONDS) {
    return { targetTime, drift, shouldSeek: forceSync || absoluteDrift > 0.15, playbackRate: 1 };
  }

  return {
    targetTime,
    drift,
    shouldSeek: false,
    playbackRate: drift > DRIFT_CORRECTION_THRESHOLD_SECONDS
      ? 1.5
      : drift < -DRIFT_CORRECTION_THRESHOLD_SECONDS ? 0.75 : 1,
  };
};

export const formatPlaybackTime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(hours ? 2 : 1, "0");
  const paddedSeconds = String(remainingSeconds).padStart(2, "0");
  return hours ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
};
