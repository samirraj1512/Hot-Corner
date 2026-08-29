import assert from "node:assert/strict";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { Server as SocketIOServer } from "socket.io";
import { io as createSocketClient } from "socket.io-client";
import "dotenv/config";
import connectDB from "../../configs/db.js";
import User from "../../models/User.js";
import WatchRoom from "../models/WatchRoom.js";
import WatchRoomHistory from "../models/WatchRoomHistory.js";
import WatchRoomSession from "../models/WatchRoomSession.js";
import {
  createWatchRoom,
  getWatchRoom,
  joinWatchRoom,
  updateRoomController,
  updateRoomMedia,
  updateRoomPlayback,
} from "../controllers/roomController.js";
import {
  getWatchTogetherAdminOverview,
  getWatchTogetherRoomDetail,
} from "../controllers/adminController.js";
import { getWatchTogetherIceServers } from "../controllers/iceController.js";
import { createDriveTranscoder } from "../services/driveTranscoder.js";
import { getR2UploadStatus } from "../services/r2Storage.js";
import { MemoryRoomRealtimeState } from "../services/roomRealtimeState.js";
import { initializeWatchTogetherSocket } from "../socket/watchTogetherSocket.js";
import { normalizeMedia } from "../utils/roomUtils.js";
import {
  extractYouTubeId,
  getGoogleDriveStreamCandidates,
  getPlaybackTime,
  getPlaybackSyncPlan,
  MAX_GOOGLE_DRIVE_FILE_SIZE,
  toDriveMedia,
} from "../../../client/src/features/watchTogether/lib/media.js";
import { uploadGoogleDriveVideo } from "../../../client/src/features/watchTogether/lib/googleDrive.js";
import { validateDirectVideoFile } from "../../../client/src/features/watchTogether/lib/directUpload.js";

const runId = `WT${Date.now().toString(36).toUpperCase()}`.slice(0, 10);
const userIds = {
  host: `${runId}-HOST`,
  guest: `${runId}-GUEST`,
  outsider: `${runId}-OUTSIDER`,
};

const sampleYouTubeMedia = {
  source: "youtube",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Integration test video",
};

const sampleDriveMedia = {
  source: "drive",
  driveFileId: "1AbCdEfGhIjKlmNopQrsTuv",
  resourceKey: "sample-resource-key",
  title: "Integration test Drive video",
  url: "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlmNopQrsTuv&export=download&resourcekey=sample-resource-key",
  mimeType: "video/mp4",
};

const invokeController = async (controller, { userId, params = {}, body = {}, query = {} }) => {
  let response;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(bodyValue) {
      response = { statusCode: this.statusCode, body: bodyValue };
      return bodyValue;
    },
  };
  await controller({ auth: () => ({ userId }), params, body, query }, res);
  assert.ok(response, "Controller did not return a JSON response.");
  return response;
};

const waitForEvent = (socket, event, timeoutMs = 4000) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => {
    socket.off(event, onEvent);
    reject(new Error(`Timed out waiting for ${event}.`));
  }, timeoutMs);
  const onEvent = (...args) => {
    clearTimeout(timeoutId);
    resolve(args.length === 1 ? args[0] : args);
  };
  socket.once(event, onEvent);
});

const expectNoEvent = (socket, event, waitMs = 100) => new Promise((resolve, reject) => {
  const onEvent = () => {
    clearTimeout(timeoutId);
    socket.off(event, onEvent);
    reject(new Error(`Unexpected ${event} event.`));
  };
  const timeoutId = setTimeout(() => {
    socket.off(event, onEvent);
    resolve();
  }, waitMs);
  socket.once(event, onEvent);
});

const emitWithAck = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  socket.timeout(4000).emit(event, payload, (timeoutError, response) => {
    if (timeoutError) reject(timeoutError);
    else resolve(response);
  });
});

const closeSocket = (socket) => new Promise((resolve) => {
  if (!socket?.connected) return resolve();
  socket.once("disconnect", resolve);
  socket.disconnect();
});

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});

const closeServer = (server) => new Promise((resolve) => server.close(resolve));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const connectSocket = async (url, token) => {
  const socket = createSocketClient(url, {
    auth: { token },
    autoConnect: false,
    forceNew: true,
    transports: ["websocket"],
  });
  const connected = waitForEvent(socket, "connect");
  socket.connect();
  await connected;
  return socket;
};

let httpServer;
let socketServer;
let hostSocket;
let guestSocket;
let outsiderSocket;
let anonymousSocket;

try {
  assert.equal(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYouTubeId("not-a-youtube-link"), "");
  const driveMediaWithResourceKey = toDriveMedia({
    id: sampleDriveMedia.driveFileId,
    name: "Resource-key video",
    resourceKey: sampleDriveMedia.resourceKey,
    webContentLink: sampleDriveMedia.url,
  });
  assert.equal(driveMediaWithResourceKey.url, sampleDriveMedia.url);
  assert.ok(getGoogleDriveStreamCandidates(driveMediaWithResourceKey).includes(sampleDriveMedia.url));
  assert.equal(normalizeMedia({
    source: "cloudinary",
    cloudinaryPublicId: "hot-corner/watch-together/abcdefgh12345678",
    title: "Prepared video",
    url: "https://res.cloudinary.com/example/video/upload/v1/hot-corner/watch-together/abcdefgh12345678.mp4",
  }).source, "cloudinary");
  assert.equal(normalizeMedia({
    source: "r2",
    r2UploadId: "79b2e91c-d814-4af7-9b23-a6c5948d33f8",
    title: "Direct upload",
    url: "https://example.r2.cloudflarestorage.com/watch-together/sample.mp4?X-Amz-Signature=test",
    mimeType: "video/mp4",
  }).source, "r2");
  assert.equal(validateDirectVideoFile({ name: "movie.webm" }), "");
  assert.match(validateDirectVideoFile({ name: "movie.mkv" }), /MP4/);
  assert.equal(typeof getR2UploadStatus().configured, "boolean");

  const uploadRequests = [];
  const cloudinaryMock = {
    config: () => ({ cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret" }),
    uploader: {
      upload: async (url, options) => {
        uploadRequests.push({ url, options });
        return { public_id: options.public_id };
      },
    },
    api: {
      resource: async (publicId) => ({
        public_id: publicId,
        eager: [{ format: "mp4", secure_url: `https://res.cloudinary.com/test-cloud/video/upload/${publicId}.mp4` }],
      }),
    },
  };
  const transcoder = createDriveTranscoder({ client: cloudinaryMock });
  const directPreparation = await transcoder.prepare(sampleDriveMedia);
  assert.equal(directPreparation.status, "ready");
  const forcedPreparation = await transcoder.prepare(sampleDriveMedia, { forceTranscode: true });
  assert.equal(forcedPreparation.status, "processing");
  const incompatibleDriveMedia = { ...sampleDriveMedia, title: "Unsupported-video.mkv", mimeType: "video/x-matroska" };
  const processingPreparation = await transcoder.prepare(incompatibleDriveMedia);
  assert.equal(processingPreparation.status, "processing");
  assert.equal(uploadRequests.length, 2);
  assert.equal(uploadRequests[1].options.resource_type, "video");
  assert.equal(uploadRequests[1].options.eager[0].video_codec, "h264");
  const completedPreparation = await transcoder.getStatus(processingPreparation);
  assert.equal(completedPreparation.status, "ready");
  assert.equal(completedPreparation.media.source, "cloudinary");
  const pendingCloudinaryTranscoder = createDriveTranscoder({
    client: {
      config: () => ({ cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret" }),
      uploader: { upload: async () => ({}) },
      api: {
        resource: async () => {
          const error = new Error("The video is still processing.");
          error.http_code = 423;
          throw error;
        },
      },
    },
  });
  assert.equal(
    (await pendingCloudinaryTranscoder.getStatus({ publicId: processingPreparation.publicId, title: "Pending video" })).status,
    "processing",
  );
  const oversizedCloudinaryTranscoder = createDriveTranscoder({
    client: {
      config: () => ({ cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret" }),
      uploader: {
        upload: async () => {
          const error = new Error("File size exceeds the maximum size.");
          error.http_code = 413;
          throw error;
        },
      },
      api: {},
    },
  });
  await assert.rejects(
    oversizedCloudinaryTranscoder.prepare(incompatibleDriveMedia),
    (error) => error.statusCode === 422 && /larger than the current Cloudinary plan/.test(error.message),
  );
  const unavailableTranscoder = createDriveTranscoder({
    client: { config: () => ({}), uploader: { upload: async () => ({}) }, api: {} },
  });
  await assert.rejects(
    unavailableTranscoder.prepare(incompatibleDriveMedia),
    (error) => error.statusCode === 503,
  );

  const originalTurnUrls = process.env.WATCH_TOGETHER_TURN_URLS;
  const originalTurnSecret = process.env.WATCH_TOGETHER_TURN_SHARED_SECRET;
  try {
    process.env.WATCH_TOGETHER_TURN_URLS = "turns:turn.example.test:5349?transport=tcp";
    process.env.WATCH_TOGETHER_TURN_SHARED_SECRET = "test-turn-secret";
    const iceResponse = await invokeController(getWatchTogetherIceServers, { userId: userIds.host });
    assert.equal(iceResponse.statusCode, 200);
    assert.equal(iceResponse.body.relayConfigured, true);
    const turnServer = iceResponse.body.iceServers.find((server) => String(server.urls).includes("turns:"));
    assert.ok(turnServer?.username.includes(userIds.host));
    assert.ok(turnServer?.credential);
  } finally {
    if (originalTurnUrls === undefined) delete process.env.WATCH_TOGETHER_TURN_URLS;
    else process.env.WATCH_TOGETHER_TURN_URLS = originalTurnUrls;
    if (originalTurnSecret === undefined) delete process.env.WATCH_TOGETHER_TURN_SHARED_SECRET;
    else process.env.WATCH_TOGETHER_TURN_SHARED_SECRET = originalTurnSecret;
  }

  const meteredEnvNames = [
    "WATCH_TOGETHER_TURN_URLS",
    "WATCH_TOGETHER_TURN_SHARED_SECRET",
    "WATCH_TOGETHER_ICE_SERVERS",
    "WATCH_TOGETHER_ICE_TRANSPORT_POLICY",
    "METERED_TURN_DOMAIN",
    "METERED_TURN_API_KEY",
    "METERED_TURN_CREDENTIAL_API_KEY",
    "METERED_TURN_SECRET_KEY",
    "METERED_TURN_PROJECT_ID",
    "METERED_TURN_CREDENTIAL_LABEL",
  ];
  const originalMeteredEnv = Object.fromEntries(meteredEnvNames.map((name) => [name, process.env[name]]));
  const originalMeteredFetch = global.fetch;
  try {
    meteredEnvNames.forEach((name) => { delete process.env[name]; });
    process.env.METERED_TURN_DOMAIN = "test-app.metered.live";
    process.env.METERED_TURN_API_KEY = "test-metered-api-key";
    let meteredRequests = 0;
    global.fetch = async (input) => {
      meteredRequests += 1;
      const url = new URL(String(input));
      assert.equal(url.hostname, "test-app.metered.live");
      assert.equal(url.pathname, "/api/v1/turn/credentials");
      assert.equal(url.searchParams.get("apiKey"), "test-metered-api-key");
      return new Response(JSON.stringify([
        { urls: "stun:stun.relay.metered.ca:80" },
        {
          urls: [
            "turn:global.relay.metered.ca:80?transport=tcp",
            "turns:global.relay.metered.ca:443?transport=tcp",
          ],
          username: "test-user",
          credential: "test-password",
        },
      ]), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const meteredIceResponse = await invokeController(getWatchTogetherIceServers, { userId: userIds.guest });
    assert.equal(meteredIceResponse.body.relayConfigured, true);
    assert.equal(meteredIceResponse.body.relayStatus, "ready");
    assert.equal(meteredIceResponse.body.iceTransportPolicy, "all");
    assert.ok(meteredIceResponse.body.iceServers.some((server) => String(server.urls).includes("turns:")));

    process.env.WATCH_TOGETHER_ICE_TRANSPORT_POLICY = "relay";
    const relayedIceResponse = await invokeController(getWatchTogetherIceServers, { userId: userIds.guest });
    assert.equal(relayedIceResponse.body.iceTransportPolicy, "relay");
    assert.equal(meteredRequests, 1);
  } finally {
    global.fetch = originalMeteredFetch;
    meteredEnvNames.forEach((name) => {
      if (originalMeteredEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalMeteredEnv[name];
    });
  }

  const realtimeState = new MemoryRoomRealtimeState({ staleConnectionMs: 1_000 });
  await realtimeState.upsertParticipant("STATE", {
    userId: userIds.host,
    socketId: "state-host",
    name: "State Host",
    image: "",
  });
  assert.equal((await realtimeState.listParticipants("STATE")).length, 1);
  await realtimeState.markParticipantDisconnected("STATE", "state-host", 40);
  assert.equal((await realtimeState.listParticipants("STATE")).length, 1);
  await wait(55);
  assert.equal((await realtimeState.listParticipants("STATE")).length, 0);
  assert.deepEqual(await realtimeState.joinCall("STATE", "call-host"), []);
  assert.deepEqual(await realtimeState.joinCall("STATE", "call-guest"), ["call-host"]);
  await realtimeState.leaveCall("STATE", "call-host");
  assert.deepEqual(await realtimeState.listCallParticipants("STATE"), ["call-guest"]);
  const delayedPlayback = getPlaybackTime({
    isPlaying: true,
    currentTime: 10,
    updatedAt: new Date(Date.now() - 2000).toISOString(),
  });
  assert.ok(delayedPlayback >= 11.5 && delayedPlayback <= 3 + 10, "Late-join playback time did not advance.");
  const hostReconnectPlayback = getPlaybackTime({
    isPlaying: true,
    currentTime: 120,
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  });
  assert.ok(hostReconnectPlayback >= 419.5 && hostReconnectPlayback <= 421, "Host reconnect playback did not preserve the shared timeline.");

  const behindPlan = getPlaybackSyncPlan({
    playback: { isPlaying: true, currentTime: 100, updatedAt: new Date().toISOString() },
    localTime: 90,
    duration: 7200,
  });
  assert.equal(behindPlan.shouldSeek, false);
  assert.equal(behindPlan.playbackRate, 1.5);
  const aheadPlan = getPlaybackSyncPlan({
    playback: { isPlaying: true, currentTime: 100, updatedAt: new Date().toISOString() },
    localTime: 110,
    duration: 7200,
  });
  assert.equal(aheadPlan.shouldSeek, false);
  assert.equal(aheadPlan.playbackRate, 0.75);
  const largeGapPlan = getPlaybackSyncPlan({
    playback: { isPlaying: true, currentTime: 100, updatedAt: new Date().toISOString() },
    localTime: 60,
    duration: 7200,
  });
  assert.equal(largeGapPlan.shouldSeek, true);
  const seekPlan = getPlaybackSyncPlan({
    playback: { isPlaying: true, currentTime: 100, updatedAt: new Date().toISOString() },
    localTime: 95,
    duration: 7200,
    forceSync: true,
  });
  assert.equal(seekPlan.shouldSeek, true);

  const originalFetch = globalThis.fetch;
  const driveRequests = [];
  const testUploadFile = {
    name: "room-video.mp4",
    type: "video/mp4",
    size: 9 * 1024 * 1024,
    slice: (start, end) => new Blob([new Uint8Array(end - start)], { type: "video/mp4" }),
  };
  const uploadProgress = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    driveRequests.push({ url: requestUrl, options });
    if (requestUrl.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      return new Response(null, { status: 200, headers: { location: "https://upload.example.test/session" } });
    }
    if (requestUrl === "https://upload.example.test/session") {
      const contentRange = options.headers?.["Content-Range"];
      if (contentRange.endsWith("/9437184") && contentRange.includes("0-8388607")) {
        return new Response(null, { status: 308 });
      }
      return new Response(JSON.stringify({ id: "drive-upload-id" }), { status: 200 });
    }
    if (requestUrl.startsWith("https://www.googleapis.com/drive/v3/files/drive-upload-id")) {
      return new Response(JSON.stringify({
        id: "drive-upload-id",
        name: "room-video.mp4",
        mimeType: "video/mp4",
        webContentLink: "https://drive.google.com/uc?export=download&id=drive-upload-id",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected Drive request: ${requestUrl}`);
  };
  try {
    const uploadedVideo = await uploadGoogleDriveVideo({
      accessToken: "test-drive-token",
      file: testUploadFile,
      onProgress: (percent) => uploadProgress.push(percent),
    });
    assert.equal(uploadedVideo.id, "drive-upload-id");
    assert.deepEqual(uploadProgress, [89, 100]);
    assert.equal(driveRequests.filter(({ url }) => url === "https://upload.example.test/session").length, 2);
    assert.equal(driveRequests[1].options.headers["Content-Range"], "bytes 0-8388607/9437184");
    assert.equal(driveRequests[2].options.headers["Content-Range"], "bytes 8388608-9437183/9437184");
    await assert.rejects(
      uploadGoogleDriveVideo({
        accessToken: "test-drive-token",
        file: { name: "too-large.mp4", type: "video/mp4", size: MAX_GOOGLE_DRIVE_FILE_SIZE + 1 },
      }),
      /up to 5 GB/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  await connectDB();

  await User.create([
    { _id: userIds.host, name: "Watch Host", email: `${runId.toLowerCase()}-host@example.test`, image: "https://example.test/host.png" },
    { _id: userIds.guest, name: "Watch Guest", email: `${runId.toLowerCase()}-guest@example.test`, image: "https://example.test/guest.png" },
    { _id: userIds.outsider, name: "Watch Outsider", email: `${runId.toLowerCase()}-outsider@example.test`, image: "https://example.test/outsider.png" },
  ]);

  const rejectedCreate = await invokeController(createWatchRoom, {
    userId: userIds.host,
    body: { media: { source: "youtube", url: "not-a-youtube-link" } },
  });
  assert.equal(rejectedCreate.statusCode, 400);
  assert.equal(rejectedCreate.body.success, false);

  const created = await invokeController(createWatchRoom, {
    userId: userIds.host,
    body: { media: sampleYouTubeMedia, displayName: "Watch Host", image: "https://example.test/host.png" },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.room.isHost, true);
  assert.equal(created.body.room.canControl, true);
  const roomCode = created.body.room.code;
  const roomHistory = await WatchRoomHistory.findOne({ roomId: created.body.room.id }).lean();
  assert.equal(roomHistory.code, roomCode);
  assert.equal(roomHistory.hostId, userIds.host);

  const fetchedByGuest = await invokeController(getWatchRoom, {
    userId: userIds.guest,
    params: { roomCode },
  });
  assert.equal(fetchedByGuest.statusCode, 200);
  assert.equal(fetchedByGuest.body.room.isHost, false);
  assert.equal(fetchedByGuest.body.room.canControl, false);

  const joinedByGuest = await invokeController(joinWatchRoom, {
    userId: userIds.guest,
    params: { roomCode },
    body: { displayName: "Watch Guest" },
  });
  assert.equal(joinedByGuest.statusCode, 200);
  assert.equal(joinedByGuest.body.profile.name, "Watch Guest");

  const guestPlaybackDenied = await invokeController(updateRoomPlayback, {
    userId: userIds.guest,
    params: { roomCode },
    body: { isPlaying: true, currentTime: 15 },
  });
  assert.equal(guestPlaybackDenied.statusCode, 403);

  const sharedControllerDenied = await invokeController(updateRoomController, {
    userId: userIds.host,
    params: { roomCode },
    body: { userId: userIds.guest, allowed: true },
  });
  assert.equal(sharedControllerDenied.statusCode, 403);

  const hostPlaybackAllowed = await invokeController(updateRoomPlayback, {
    userId: userIds.host,
    params: { roomCode },
    body: { isPlaying: true, currentTime: 47.25 },
  });
  assert.equal(hostPlaybackAllowed.statusCode, 200);
  assert.equal(hostPlaybackAllowed.body.room.playback.currentTime, 47.25);

  const guestMediaDenied = await invokeController(updateRoomMedia, {
    userId: userIds.guest,
    params: { roomCode },
    body: { media: sampleDriveMedia },
  });
  assert.equal(guestMediaDenied.statusCode, 403);

  const hostMediaChanged = await invokeController(updateRoomMedia, {
    userId: userIds.host,
    params: { roomCode },
    body: { media: sampleDriveMedia },
  });
  assert.equal(hostMediaChanged.statusCode, 200);
  assert.equal(hostMediaChanged.body.room.media.source, "drive");
  assert.equal(hostMediaChanged.body.room.media.url, sampleDriveMedia.url);
  assert.equal(hostMediaChanged.body.room.media.resourceKey, sampleDriveMedia.resourceKey);
  assert.equal(hostMediaChanged.body.room.playback.currentTime, 0);

  const guestPlaybackStillDenied = await invokeController(updateRoomPlayback, {
    userId: userIds.guest,
    params: { roomCode },
    body: { isPlaying: false, currentTime: 0 },
  });
  assert.equal(guestPlaybackStillDenied.statusCode, 403);

  const expiredRoom = await WatchRoom.create({
    code: `EX${Date.now().toString().slice(-8)}`,
    hostId: userIds.host,
    hostName: "Watch Host",
    controllers: [],
    media: { source: "youtube", title: "Expired", youtubeId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    playback: { isPlaying: false, currentTime: 0, updatedAt: new Date() },
    expiresAt: new Date(Date.now() - 1000),
  });
  const expiredFetch = await invokeController(getWatchRoom, {
    userId: userIds.host,
    params: { roomCode: expiredRoom.code },
  });
  assert.equal(expiredFetch.statusCode, 404);

  httpServer = createServer();
  socketServer = new SocketIOServer(httpServer, { cors: { origin: true } });
  const tokenOwners = new Map([
    ["host-token", userIds.host],
    ["guest-token", userIds.guest],
    ["outsider-token", userIds.outsider],
  ]);
  initializeWatchTogetherSocket(socketServer, {
    verifyTokenFn: async (token) => {
      const userId = tokenOwners.get(token);
      if (!userId) throw new Error("Invalid token");
      return { sub: userId };
    },
    presenceGraceMs: 150,
  });
  await listen(httpServer);
  const address = httpServer.address();
  const socketUrl = `http://127.0.0.1:${address.port}`;

  anonymousSocket = createSocketClient(socketUrl, { autoConnect: false, forceNew: true, transports: ["websocket"] });
  const anonymousErrorEvent = waitForEvent(anonymousSocket, "connect_error");
  anonymousSocket.connect();
  const anonymousError = await anonymousErrorEvent;
  assert.equal(anonymousError.message, "Authentication is required.");
  anonymousSocket.disconnect();

  hostSocket = await connectSocket(socketUrl, "host-token");
  guestSocket = await connectSocket(socketUrl, "guest-token");
  outsiderSocket = await connectSocket(socketUrl, "outsider-token");

  const hostJoin = await emitWithAck(hostSocket, "watch:join", { roomCode, displayName: "Socket Host" });
  assert.equal(hostJoin.ok, true);
  assert.equal(hostJoin.room.isHost, true);

  const participantUpdate = waitForEvent(hostSocket, "watch:participants");
  const guestJoin = await emitWithAck(guestSocket, "watch:join", { roomCode, displayName: "Socket Guest" });
  assert.equal(guestJoin.ok, true);
  assert.equal(guestJoin.room.canControl, false);
  const participants = await participantUpdate;
  assert.equal(participants.length, 2);
  assert.equal(await WatchRoomSession.countDocuments({ roomCode }), 2);

  const socketGuestPlaybackDenied = await emitWithAck(guestSocket, "watch:playback", { isPlaying: true, currentTime: 12 });
  assert.equal(socketGuestPlaybackDenied.ok, false);

  const socketGrant = await emitWithAck(hostSocket, "watch:controller", { userId: userIds.guest, allowed: true });
  assert.equal(socketGrant.ok, false);

  const guestPlaybackEvent = waitForEvent(guestSocket, "watch:playback");
  const socketHostPlayback = await emitWithAck(hostSocket, "watch:playback", { isPlaying: true, currentTime: 76.5, forceSync: true });
  assert.equal(socketHostPlayback.ok, true);
  const synchronizedPlayback = await guestPlaybackEvent;
  assert.equal(synchronizedPlayback.playback.currentTime, 76.5);
  assert.equal(synchronizedPlayback.forceSync, true);
  assert.ok(synchronizedPlayback.serverNow);

  const socketGuestPlaybackStillDenied = await emitWithAck(guestSocket, "watch:playback", { isPlaying: false, currentTime: 0 });
  assert.equal(socketGuestPlaybackStillDenied.ok, false);

  const hostDisconnectParticipants = waitForEvent(guestSocket, "watch:participants");
  const hostStaysVisibleDuringGrace = expectNoEvent(guestSocket, "watch:participants", 60);
  await closeSocket(hostSocket);
  await hostStaysVisibleDuringGrace;
  const participantsAfterHostDisconnect = await hostDisconnectParticipants;
  assert.equal(participantsAfterHostDisconnect.some((participant) => participant.userId === userIds.host), false);
  const roomAfterHostDisconnect = await invokeController(getWatchRoom, {
    userId: userIds.guest,
    params: { roomCode },
  });
  assert.equal(roomAfterHostDisconnect.body.room.playback.isPlaying, true);

  hostSocket = await connectSocket(socketUrl, "host-token");
  const hostRejoin = await emitWithAck(hostSocket, "watch:join", { roomCode, displayName: "Socket Host" });
  assert.equal(hostRejoin.ok, true);
  assert.equal(hostRejoin.room.playback.isPlaying, true);

  const guestChatEvent = waitForEvent(hostSocket, "watch:chat");
  const socketChat = await emitWithAck(guestSocket, "watch:chat", { text: "  Hello   from  the room  " });
  assert.equal(socketChat.ok, true);
  assert.equal((await guestChatEvent).text, "Hello from the room");
  const roomWithChat = await WatchRoom.findOne({ code: roomCode }).lean();
  assert.equal(roomWithChat.messages.length, 1);
  assert.equal(roomWithChat.messages[0].text, "Hello from the room");

  await closeSocket(guestSocket);
  guestSocket = await connectSocket(socketUrl, "guest-token");
  const guestRejoinWithHistory = await emitWithAck(guestSocket, "watch:join", { roomCode, displayName: "Socket Guest" });
  assert.equal(guestRejoinWithHistory.ok, true);
  assert.equal(guestRejoinWithHistory.room.messages.length, 1);
  assert.equal(guestRejoinWithHistory.room.messages[0].text, "Hello from the room");

  const socketBlankChat = await emitWithAck(guestSocket, "watch:chat", { text: "   " });
  assert.equal(socketBlankChat.ok, false);

  const socketGuestMediaDenied = await emitWithAck(guestSocket, "watch:media", { media: sampleYouTubeMedia });
  assert.equal(socketGuestMediaDenied.ok, false);

  const guestMediaEvent = waitForEvent(guestSocket, "watch:media");
  const socketHostMedia = await emitWithAck(hostSocket, "watch:media", { media: sampleYouTubeMedia });
  assert.equal(socketHostMedia.ok, true);
  assert.equal((await guestMediaEvent).room.media.source, "youtube");
  guestSocket.emit("watch:presence-heartbeat");
  await wait(50);
  const roomHistoryAfterGuestHeartbeat = await WatchRoomHistory.findOne({ roomId: created.body.room.id }).lean();
  assert.equal(roomHistoryAfterGuestHeartbeat.media.source, "youtube");

  const guestCallState = waitForEvent(guestSocket, "watch:call-state");
  const hostCall = await emitWithAck(hostSocket, "watch:call-join");
  assert.equal(hostCall.ok, true);
  assert.equal(hostCall.existingSockets.length, 0);
  assert.equal((await guestCallState).active, true);

  const hostParticipantJoined = waitForEvent(hostSocket, "watch:call-participant-joined");
  const guestCall = await emitWithAck(guestSocket, "watch:call-join");
  assert.equal(guestCall.ok, true);
  assert.deepEqual(guestCall.existingSockets, [hostSocket.id]);
  assert.equal((await hostParticipantJoined).socketId, guestSocket.id);

  const guestSocketBeforeCallReconnect = guestSocket.id;
  const hostCallLeftDuringGuestReconnect = waitForEvent(hostSocket, "watch:call-participant-left");
  await closeSocket(guestSocket);
  assert.equal((await hostCallLeftDuringGuestReconnect).socketId, guestSocketBeforeCallReconnect);

  guestSocket = await connectSocket(socketUrl, "guest-token");
  const guestRoomReadyAfterReconnect = waitForEvent(guestSocket, "watch:room-ready");
  const guestReconnectJoin = await emitWithAck(guestSocket, "watch:join", { roomCode, displayName: "Socket Guest" });
  assert.equal(guestReconnectJoin.ok, true);
  assert.equal((await guestRoomReadyAfterReconnect).roomCode, roomCode);
  const activeGuestSessions = await WatchRoomSession.find({ roomCode, userId: userIds.guest, endedAt: null }).lean();
  assert.equal(activeGuestSessions.length, 1);
  assert.ok(activeGuestSessions[0].connectionCount >= 2);

  const hostCallRejoined = waitForEvent(hostSocket, "watch:call-participant-joined");
  const guestRejoinedCall = await emitWithAck(guestSocket, "watch:call-join");
  assert.equal(guestRejoinedCall.ok, true);
  assert.deepEqual(guestRejoinedCall.existingSockets, [hostSocket.id]);
  assert.equal((await hostCallRejoined).socketId, guestSocket.id);

  const hostSignal = waitForEvent(hostSocket, "watch:webrtc-signal");
  const signalForwarded = await emitWithAck(guestSocket, "watch:webrtc-signal", {
    to: hostSocket.id,
    signal: { type: "offer", sdp: "test-sdp" },
  });
  assert.equal(signalForwarded.ok, true);
  assert.equal((await hostSignal).signal.sdp, "test-sdp");

  const outsiderJoin = await emitWithAck(outsiderSocket, "watch:join", { roomCode, displayName: "Socket Outsider" });
  assert.equal(outsiderJoin.ok, true);
  const outsiderSignal = await emitWithAck(outsiderSocket, "watch:webrtc-signal", {
    to: hostSocket.id,
    signal: { type: "offer", sdp: "blocked" },
  });
  assert.equal(outsiderSignal.ok, false);

  const watchOverview = await invokeController(getWatchTogetherAdminOverview, {
    userId: userIds.host,
    query: { range: "all", limit: "25" },
  });
  assert.equal(watchOverview.statusCode, 200);
  const overviewRoom = watchOverview.body.rooms.find((room) => room.code === roomCode);
  assert.ok(overviewRoom);
  assert.ok(overviewRoom.viewerCount >= 3);

  const watchRoomDetail = await invokeController(getWatchTogetherRoomDetail, {
    userId: userIds.host,
    params: { roomId: overviewRoom.id },
  });
  assert.equal(watchRoomDetail.statusCode, 200);
  assert.ok(watchRoomDetail.body.sessions.some((session) => session.user.id === userIds.host));
  assert.ok(watchRoomDetail.body.sessions.some((session) => session.user.id === userIds.guest));

  const hostCallLeave = waitForEvent(hostSocket, "watch:call-participant-left");
  const guestLeave = await emitWithAck(guestSocket, "watch:call-leave");
  assert.equal(guestLeave.ok, true);
  assert.equal((await hostCallLeave).socketId, guestSocket.id);
  const hostLeave = await emitWithAck(hostSocket, "watch:call-leave");
  assert.equal(hostLeave.ok, true);

  console.log("Watch Together verification passed: API permissions, media validation, socket sync, chat, call signaling, and admin activity history.");
} finally {
  await Promise.all([
    closeSocket(hostSocket),
    closeSocket(guestSocket),
    closeSocket(outsiderSocket),
    closeSocket(anonymousSocket),
  ]);
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  if (httpServer?.listening) await closeServer(httpServer);
  await wait(200);
  await WatchRoomSession.deleteMany({ userId: { $in: Object.values(userIds) } });
  await WatchRoomHistory.deleteMany({ hostId: { $in: Object.values(userIds) } });
  await WatchRoom.deleteMany({ hostId: { $in: Object.values(userIds) } });
  await User.deleteMany({ _id: { $in: Object.values(userIds) } });
  await mongoose.disconnect();
}
