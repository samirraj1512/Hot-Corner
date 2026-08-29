import { MAX_GOOGLE_DRIVE_FILE_SIZE } from "./media.js";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
let googleIdentityPromise;

const getClientId = () => import.meta.env.VITE_GOOGLE_CLIENT_ID;

const readGoogleError = async (response) => {
  try {
    const body = await response.json();
    return body.error?.message || body.error_description || "Google Drive could not complete that request.";
  } catch {
    return "Google Drive could not complete that request.";
  }
};

const driveRequest = async (url, accessToken, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) throw new Error(await readGoogleError(response));
  return response;
};

const loadGoogleIdentity = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (googleIdentityPromise) return googleIdentityPromise;

  googleIdentityPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    const script = existingScript || document.createElement("script");
    const finishLoading = () => window.google?.accounts?.oauth2
      ? resolve(window.google)
      : reject(new Error("Google sign-in did not load."));

    if (existingScript) {
      existingScript.addEventListener("load", finishLoading, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google sign-in did not load.")), { once: true });
      if (window.google?.accounts?.oauth2) finishLoading();
      return;
    }

    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = finishLoading;
    script.onerror = () => reject(new Error("Google sign-in did not load."));
    document.head.appendChild(script);
  });

  return googleIdentityPromise;
};

export const isGoogleDriveConfigured = () => Boolean(getClientId());

export const connectGoogleDrive = async () => {
  const clientId = getClientId();
  if (!clientId) throw new Error("Google Drive is not configured for this app yet.");

  const google = await loadGoogleIdentity();
  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || "Google Drive access was not granted."));
          return;
        }
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
};

export const listGoogleDriveVideos = async (accessToken) => {
  const params = new URLSearchParams({
    q: "mimeType contains 'video/' and trashed = false",
    pageSize: "30",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink,resourceKey,size,modifiedTime)",
  });
  const response = await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`, accessToken);
  const data = await response.json();
  return data.files || [];
};

export const shareGoogleDriveFileWithRoom = async (accessToken, fileId) => {
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader" }),
  });
};

export const getGoogleDriveVideo = async (accessToken, fileId) => {
  const fields = "id,name,mimeType,thumbnailLink,webViewLink,webContentLink,resourceKey,size,modifiedTime";
  const response = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${encodeURIComponent(fields)}`,
    accessToken,
  );
  return response.json();
};

export const uploadGoogleDriveVideo = async ({ accessToken, file, onProgress }) => {
  if (!file?.type.startsWith("video/")) throw new Error("Choose a video file to upload.");
  if (file.size > MAX_GOOGLE_DRIVE_FILE_SIZE) throw new Error("Videos can be up to 5 GB.");

  const startResponse = await driveRequest(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": file.type,
        "X-Upload-Content-Length": String(file.size),
      },
      body: JSON.stringify({ name: file.name, mimeType: file.type }),
    },
  );
  const uploadUrl = startResponse.headers.get("location");
  if (!uploadUrl) throw new Error("Google Drive did not return an upload session.");

  const chunkSize = 8 * 1024 * 1024;
  let start = 0;
  let completedFile;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: chunk,
    });

    if (response.status !== 308 && !response.ok) throw new Error(await readGoogleError(response));
    if (response.ok) completedFile = await response.json();
    start = end;
    onProgress?.(Math.round((start / file.size) * 100));
  }

  if (!completedFile?.id) throw new Error("Google Drive did not finish the upload.");
  return getGoogleDriveVideo(accessToken, completedFile.id);
};
