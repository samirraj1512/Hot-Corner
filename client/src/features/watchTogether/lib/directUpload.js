const UPLOAD_CONCURRENCY = 3;
const MAX_PART_ATTEMPTS = 3;

const isBrowserCompatibleFile = (file) => /\.(mp4|m4v|webm|ogv|ogg)$/i.test(String(file?.name || ""));

const getErrorMessage = (error, fallback) => (
  error?.response?.data?.message || error?.message || fallback
);

const getAuthorization = async (getToken) => ({
  headers: { Authorization: `Bearer ${await getToken()}` },
});

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const uploadPart = ({ url, body, signal, onProgress }) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  const abort = () => request.abort();

  request.open("PUT", url, true);
  request.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress(event.loaded);
  };
  request.onload = () => {
    signal?.removeEventListener("abort", abort);
    if (request.status < 200 || request.status >= 300) {
      reject(new Error(`Storage rejected upload part (${request.status}).`));
      return;
    }
    const eTag = request.getResponseHeader("ETag");
    if (!eTag) {
      reject(new Error("Storage did not return an upload receipt. Check the R2 CORS policy."));
      return;
    }
    resolve(eTag);
  };
  request.onerror = () => {
    signal?.removeEventListener("abort", abort);
    reject(new Error("The browser could not upload this video part."));
  };
  request.onabort = () => {
    signal?.removeEventListener("abort", abort);
    reject(new DOMException("The upload was cancelled.", "AbortError"));
  };
  signal?.addEventListener("abort", abort, { once: true });
  request.send(body);
});

const uploadPartWithRetry = async (options) => {
  let lastError;
  for (let attempt = 0; attempt < MAX_PART_ATTEMPTS; attempt += 1) {
    try {
      return await uploadPart(options);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      lastError = error;
      if (attempt < MAX_PART_ATTEMPTS - 1) await wait((attempt + 1) * 800);
    }
  }
  throw lastError;
};

export const validateDirectVideoFile = (file) => {
  if (!file) return "Choose a video file first.";
  if (!isBrowserCompatibleFile(file)) {
    return "For synchronized playback, use an H.264/AAC MP4, WebM, or Ogg video. MKV and HEVC files need conversion first.";
  }
  return "";
};

export const getDirectUploadStatus = async ({ axios, getToken }) => {
  const { data } = await axios.get("/api/watch-together/r2/status", await getAuthorization(getToken));
  if (!data?.success) throw new Error(data?.message || "Could not check direct upload storage.");
  return data;
};

export const uploadDirectVideo = async ({ axios, getToken, file, title, onProgress, signal }) => {
  const validationError = validateDirectVideoFile(file);
  if (validationError) throw new Error(validationError);

  let uploadId = "";
  let allPartsUploaded = false;
  try {
    const { data: startData } = await axios.post(
      "/api/watch-together/r2/uploads",
      { file: { name: file.name, size: file.size, type: file.type } },
      await getAuthorization(getToken),
    );
    if (!startData?.success || !Array.isArray(startData.parts)) {
      throw new Error(startData?.message || "Could not start the direct video upload.");
    }

    uploadId = startData.uploadId;
    const uploadedBytes = new Map();
    const completedBytes = new Map();
    const reportProgress = () => {
      const uploaded = [...uploadedBytes.values()].reduce((total, value) => total + value, 0);
      const completed = [...completedBytes.values()].reduce((total, value) => total + value, 0);
      onProgress?.(Math.min(99, Math.floor(((uploaded + completed) / file.size) * 100)));
    };
    let nextPartIndex = 0;
    const results = new Array(startData.parts.length);

    const worker = async () => {
      while (nextPartIndex < startData.parts.length) {
        if (signal?.aborted) throw new DOMException("The upload was cancelled.", "AbortError");
        const partIndex = nextPartIndex;
        nextPartIndex += 1;
        const part = startData.parts[partIndex];
        const start = partIndex * startData.partSize;
        const end = Math.min(start + startData.partSize, file.size);
        const body = file.slice(start, end);
        uploadedBytes.set(part.partNumber, 0);

        const eTag = await uploadPartWithRetry({
          url: part.url,
          body,
          signal,
          onProgress: (loaded) => {
            uploadedBytes.set(part.partNumber, loaded);
            reportProgress();
          },
        });
        uploadedBytes.delete(part.partNumber);
        completedBytes.set(part.partNumber, body.size);
        reportProgress();
        results[partIndex] = { partNumber: part.partNumber, eTag };
      }
    };

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, startData.parts.length) }, worker));
    allPartsUploaded = true;
    const { data: completeData } = await axios.post(
      `/api/watch-together/r2/uploads/${encodeURIComponent(uploadId)}/complete`,
      { parts: results, title },
      await getAuthorization(getToken),
    );
    if (!completeData?.success || !completeData.media) {
      throw new Error(completeData?.message || "The storage service could not finish this video.");
    }
    onProgress?.(100);
    return completeData.media;
  } catch (error) {
    if (uploadId && !allPartsUploaded) {
      try {
        await axios.delete(
          `/api/watch-together/r2/uploads/${encodeURIComponent(uploadId)}`,
          await getAuthorization(getToken),
        );
      } catch {
        // R2 removes incomplete multipart uploads automatically; preserving the original upload error is more useful.
      }
    }
    if (error?.name === "AbortError") throw error;
    throw new Error(getErrorMessage(error, "Could not upload this video."));
  }
};
