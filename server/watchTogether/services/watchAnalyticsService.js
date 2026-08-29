import WatchRoomHistory from "../models/WatchRoomHistory.js";
import WatchRoomSession from "../models/WatchRoomSession.js";

const SESSION_STALE_MS = 2 * 60 * 1000;

const asDate = (value, fallback = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const roomSnapshot = (room) => ({
  roomId: room?._id,
  code: String(room?.code || "").toUpperCase(),
  hostId: String(room?.hostId || ""),
  hostName: String(room?.hostName || "Movie fan"),
  hostImage: String(room?.hostImage || ""),
  media: {
    source: String(room?.media?.source || "youtube"),
    title: String(room?.media?.title || "Shared video"),
  },
  expiresAt: asDate(room?.expiresAt),
  createdAt: asDate(room?.createdAt),
});

const getSessionSeconds = (joinedAt, endedAt) => Math.max(
  0,
  Math.floor((asDate(endedAt).getTime() - asDate(joinedAt).getTime()) / 1000),
);

const updateRoomHistory = async (room, { activityType, at = new Date() } = {}) => {
  const snapshot = roomSnapshot(room);
  if (!snapshot.roomId || !snapshot.code || !snapshot.hostId) return null;

  await WatchRoomHistory.updateOne(
    { roomId: snapshot.roomId },
    {
      $set: {
        code: snapshot.code,
        hostId: snapshot.hostId,
        hostName: snapshot.hostName,
        hostImage: snapshot.hostImage,
        media: snapshot.media,
        expiresAt: snapshot.expiresAt,
        lastActivityAt: asDate(at),
        lastActivityType: activityType || "watching",
      },
      $setOnInsert: {
        roomId: snapshot.roomId,
        roomCreatedAt: snapshot.createdAt,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  return snapshot;
};

// Socket heartbeats can carry a room snapshot from before the host changes the
// media. They should update presence only, never restore that older metadata.
const touchRoomHistory = async (room, { activityType, at = new Date() } = {}) => {
  const snapshot = roomSnapshot(room);
  if (!snapshot.roomId || !snapshot.code || !snapshot.hostId) return null;

  await WatchRoomHistory.updateOne(
    { roomId: snapshot.roomId },
    {
      $set: {
        lastActivityAt: asDate(at),
        lastActivityType: activityType || "watching",
      },
      $setOnInsert: {
        roomId: snapshot.roomId,
        code: snapshot.code,
        hostId: snapshot.hostId,
        hostName: snapshot.hostName,
        hostImage: snapshot.hostImage,
        media: snapshot.media,
        roomCreatedAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  return snapshot;
};

const closeStaleSessionForUser = async ({ roomId, userId, at }) => {
  const staleBefore = new Date(asDate(at).getTime() - SESSION_STALE_MS);
  const staleSession = await WatchRoomSession.findOne({
    roomId,
    userId,
    endedAt: null,
    lastSeenAt: { $lt: staleBefore },
  }).select("joinedAt lastSeenAt");

  if (!staleSession) return null;

  const endedAt = asDate(staleSession.lastSeenAt);
  const watchSeconds = getSessionSeconds(staleSession.joinedAt, endedAt);
  await WatchRoomSession.updateOne(
    { _id: staleSession._id, endedAt: null },
    { $set: { endedAt, watchSeconds } },
  );
  return staleSession;
};

const updateSessionProgress = async ({ roomId, userId, at }) => {
  const session = await WatchRoomSession.findOne({ roomId, userId, endedAt: null })
    .select("joinedAt");
  if (!session) return null;

  const watchSeconds = getSessionSeconds(session.joinedAt, at);
  await WatchRoomSession.updateOne(
    { _id: session._id, endedAt: null },
    { $set: { lastSeenAt: asDate(at), watchSeconds } },
  );
  return session;
};

export const recordWatchRoomCreated = async (room) => {
  const snapshot = roomSnapshot(room);
  if (!snapshot.roomId || !snapshot.code || !snapshot.hostId) return null;

  await WatchRoomHistory.updateOne(
    { roomId: snapshot.roomId },
    {
      $setOnInsert: {
        roomId: snapshot.roomId,
        code: snapshot.code,
        hostId: snapshot.hostId,
        hostName: snapshot.hostName,
        hostImage: snapshot.hostImage,
        media: snapshot.media,
        roomCreatedAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt,
        lastActivityAt: snapshot.createdAt,
        lastActivityType: "created",
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  return snapshot;
};

export const recordWatchRoomActivity = async (room, activityType, at = new Date()) => (
  updateRoomHistory(room, { activityType, at })
);

export const recordWatchSessionJoin = async ({ room, participant, at = new Date() }) => {
  const snapshot = await updateRoomHistory(room, { activityType: "joined", at });
  if (!snapshot || !participant?.userId) return null;

  await closeStaleSessionForUser({ roomId: snapshot.roomId, userId: participant.userId, at });

  const update = {
    $set: {
      roomCode: snapshot.code,
      userName: String(participant.name || "Movie fan"),
      userImage: String(participant.image || ""),
      lastSeenAt: asDate(at),
    },
    $setOnInsert: {
      roomId: snapshot.roomId,
      userId: participant.userId,
      joinedAt: asDate(at),
      watchSeconds: 0,
    },
    $inc: { connectionCount: 1 },
  };

  try {
    return await WatchRoomSession.findOneAndUpdate(
      { roomId: snapshot.roomId, userId: participant.userId, endedAt: null },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return WatchRoomSession.findOneAndUpdate(
      { roomId: snapshot.roomId, userId: participant.userId, endedAt: null },
      update,
      { new: true },
    );
  }
};

export const recordWatchSessionHeartbeat = async ({ room, userId, at = new Date() }) => {
  const snapshot = await touchRoomHistory(room, { activityType: "watching", at });
  if (!snapshot || !userId) return null;
  return updateSessionProgress({ roomId: snapshot.roomId, userId, at });
};

export const finishWatchSession = async ({ room, userId, leftAt = new Date() }) => {
  const snapshot = roomSnapshot(room);
  if (!snapshot.roomId || !userId) return null;

  const session = await WatchRoomSession.findOne({
    roomId: snapshot.roomId,
    userId,
    endedAt: null,
  }).select("joinedAt lastSeenAt");
  if (!session) return null;

  const departure = asDate(leftAt);
  if (asDate(session.lastSeenAt).getTime() > departure.getTime()) return session;

  const watchSeconds = getSessionSeconds(session.joinedAt, departure);
  const result = await WatchRoomSession.updateOne(
    { _id: session._id, endedAt: null, lastSeenAt: { $lte: departure } },
    { $set: { lastSeenAt: departure, endedAt: departure, watchSeconds } },
  );

  if (result.modifiedCount) {
    await touchRoomHistory(room, { activityType: "left", at: departure });
  }
  return session;
};
