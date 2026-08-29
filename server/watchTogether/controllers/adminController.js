import mongoose from "mongoose";
import WatchRoom from "../models/WatchRoom.js";
import WatchRoomHistory from "../models/WatchRoomHistory.js";
import WatchRoomSession from "../models/WatchRoomSession.js";
import { recordWatchRoomCreated } from "../services/watchAnalyticsService.js";

const ACTIVE_SESSION_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value) => {
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

const getRangeStart = (range) => {
  const now = Date.now();
  const daysByRange = { "7d": 7, "30d": 30, "90d": 90 };
  const days = daysByRange[String(range || "30d").toLowerCase()];
  return days ? new Date(now - days * 24 * 60 * 60 * 1000) : null;
};

const parsePositiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getSessionDurationSeconds = (session, now = new Date()) => {
  const storedSeconds = Math.max(0, Number(session.watchSeconds) || 0);
  const joinedAt = toDate(session.joinedAt);
  const lastSeenAt = toDate(session.lastSeenAt) || joinedAt;
  const endedAt = toDate(session.endedAt);
  if (!joinedAt || !lastSeenAt) return storedSeconds;

  const active = !endedAt && now.getTime() - lastSeenAt.getTime() <= ACTIVE_SESSION_WINDOW_MS;
  const effectiveEnd = endedAt || (active ? now : lastSeenAt);
  const elapsedSeconds = Math.max(0, Math.floor((effectiveEnd.getTime() - joinedAt.getTime()) / 1000));
  return Math.max(storedSeconds, elapsedSeconds);
};

const isSessionActive = (session, now = new Date()) => (
  !session.endedAt
  && Boolean(toDate(session.lastSeenAt))
  && now.getTime() - toDate(session.lastSeenAt).getTime() <= ACTIVE_SESSION_WINDOW_MS
);

const backfillActiveRoomHistory = async () => {
  const rooms = await WatchRoom.find({ expiresAt: { $gt: new Date() } })
    .select("code hostId hostName hostImage media expiresAt createdAt")
    .lean();

  await Promise.all(rooms.map(async (room) => {
    try {
      await recordWatchRoomCreated(room);
    } catch (error) {
      console.error("Could not backfill Watch Together room history:", error.message);
    }
  }));
};

const buildHistoryFilter = ({ range, search }) => {
  const conditions = [];
  const rangeStart = getRangeStart(range);
  if (rangeStart) {
    conditions.push({
      $or: [
        { roomCreatedAt: { $gte: rangeStart } },
        { lastActivityAt: { $gte: rangeStart } },
      ],
    });
  }

  const cleanSearch = String(search || "").trim().slice(0, 100);
  if (cleanSearch) {
    const expression = new RegExp(escapeRegex(cleanSearch), "i");
    conditions.push({
      $or: [
        { code: expression },
        { hostName: expression },
        { "media.title": expression },
      ],
    });
  }

  if (!conditions.length) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
};

const getRoomSessionStats = async (roomIds, activeAfter, now = new Date()) => {
  if (!roomIds.length) return new Map();

  const [stats, activeSessions] = await Promise.all([
    WatchRoomSession.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      {
        $group: {
          _id: "$roomId",
          sessionCount: { $sum: 1 },
          viewerIds: { $addToSet: "$userId" },
          totalWatchSeconds: { $sum: "$watchSeconds" },
          lastWatchedAt: { $max: "$lastSeenAt" },
          activeSessionCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$endedAt", null] }, { $gte: ["$lastSeenAt", activeAfter] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    WatchRoomSession.find({
      roomId: { $in: roomIds },
      endedAt: null,
      lastSeenAt: { $gte: activeAfter },
    }).select("roomId joinedAt lastSeenAt endedAt watchSeconds").lean(),
  ]);

  const statsByRoom = new Map(stats.map((stat) => [stat._id.toString(), {
    sessionCount: stat.sessionCount,
    viewerCount: stat.viewerIds.length,
    totalWatchSeconds: stat.totalWatchSeconds,
    lastWatchedAt: stat.lastWatchedAt,
    activeSessionCount: stat.activeSessionCount,
  }]));

  for (const session of activeSessions) {
    const roomStats = statsByRoom.get(session.roomId.toString());
    if (!roomStats) continue;
    const storedSeconds = Math.max(0, Number(session.watchSeconds) || 0);
    roomStats.totalWatchSeconds += Math.max(0, getSessionDurationSeconds(session, now) - storedSeconds);
  }

  return statsByRoom;
};

const presentRoom = (history, stats = {}) => ({
  id: history._id.toString(),
  roomId: history.roomId.toString(),
  code: history.code,
  host: {
    id: history.hostId,
    name: history.hostName,
    image: history.hostImage || "",
  },
  media: {
    source: history.media.source,
    title: history.media.title,
  },
  createdAt: toIso(history.roomCreatedAt),
  expiresAt: toIso(history.expiresAt),
  lastActivityAt: toIso(history.lastActivityAt),
  lastActivityType: history.lastActivityType,
  viewerCount: Number(stats.viewerCount || 0),
  sessionCount: Number(stats.sessionCount || 0),
  totalWatchSeconds: Number(stats.totalWatchSeconds || 0),
  lastWatchedAt: toIso(stats.lastWatchedAt),
  activeSessionCount: Number(stats.activeSessionCount || 0),
});

const presentSession = (session, now) => {
  const active = isSessionActive(session, now);
  const endedAt = toDate(session.endedAt);
  return {
    id: session._id.toString(),
    user: {
      id: session.userId,
      name: session.userName,
      image: session.userImage || "",
    },
    joinedAt: toIso(session.joinedAt),
    lastSeenAt: toIso(session.lastSeenAt),
    endedAt: toIso(endedAt),
    watchSeconds: getSessionDurationSeconds(session, now),
    connectionCount: Math.max(1, Number(session.connectionCount) || 1),
    status: active ? "watching" : endedAt ? "left" : "disconnected",
  };
};

export const getWatchTogetherAdminOverview = async (req, res) => {
  try {
    await backfillActiveRoomHistory();

    const range = String(req.query.range || "30d").toLowerCase();
    const page = parsePositiveInteger(req.query.page, 1, 10_000);
    const limit = parsePositiveInteger(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const historyFilter = buildHistoryFilter({ range, search: req.query.search });
    const rangeStart = getRangeStart(range);
    const now = new Date();
    const activeAfter = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);
    const sessionRangeFilter = rangeStart ? { lastSeenAt: { $gte: rangeStart } } : {};

    const [total, histories, sessionSummary, activeSessions] = await Promise.all([
      WatchRoomHistory.countDocuments(historyFilter),
      WatchRoomHistory.find(historyFilter)
        .sort({ lastActivityAt: -1, roomCreatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WatchRoomSession.aggregate([
        { $match: sessionRangeFilter },
        {
          $group: {
            _id: null,
            sessionCount: { $sum: 1 },
            viewerIds: { $addToSet: "$userId" },
            totalWatchSeconds: { $sum: "$watchSeconds" },
          },
        },
      ]),
      WatchRoomSession.find({ endedAt: null, lastSeenAt: { $gte: activeAfter } })
        .select("roomId joinedAt lastSeenAt endedAt watchSeconds")
        .lean(),
    ]);

    const roomIds = histories.map((history) => history.roomId);
    const roomStats = await getRoomSessionStats(roomIds, activeAfter, now);
    const totals = sessionSummary[0] || {};
    const liveDurationAdjustment = activeSessions.reduce((totalWatchSeconds, session) => {
      const storedSeconds = Math.max(0, Number(session.watchSeconds) || 0);
      return totalWatchSeconds + Math.max(0, getSessionDurationSeconds(session, now) - storedSeconds);
    }, 0);
    const activeRoomIds = new Set(activeSessions.map((session) => session.roomId.toString()));

    return res.json({
      success: true,
      summary: {
        roomsCreated: await WatchRoomHistory.countDocuments(rangeStart ? { roomCreatedAt: { $gte: rangeStart } } : {}),
        viewingSessions: Number(totals.sessionCount || 0),
        uniqueViewers: Array.isArray(totals.viewerIds) ? totals.viewerIds.length : 0,
        totalWatchSeconds: Number(totals.totalWatchSeconds || 0) + liveDurationAdjustment,
        activeRooms: activeRoomIds.size,
      },
      rooms: histories.map((history) => presentRoom(history, roomStats.get(history.roomId.toString()))),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Could not load Watch Together admin history:", error.message);
    return res.status(500).json({ success: false, message: "Could not load Watch Together activity." });
  }
};

export const getWatchTogetherRoomDetail = async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({ success: false, message: "That Watch Together room is invalid." });
    }

    const history = await WatchRoomHistory.findById(roomId).lean();
    if (!history) {
      return res.status(404).json({ success: false, message: "That Watch Together room history was not found." });
    }

    const now = new Date();
    const sessions = await WatchRoomSession.find({ roomId: history.roomId })
      .sort({ joinedAt: -1 })
      .limit(250)
      .lean();
    const presentedSessions = sessions.map((session) => presentSession(session, now));
    const viewerCount = new Set(presentedSessions.map((session) => session.user.id)).size;
    const totalWatchSeconds = presentedSessions.reduce((total, session) => total + session.watchSeconds, 0);
    const activeAfter = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);
    const roomStats = await getRoomSessionStats([history.roomId], activeAfter);

    return res.json({
      success: true,
      room: presentRoom(history, roomStats.get(history.roomId.toString())),
      summary: {
        sessionCount: presentedSessions.length,
        viewerCount,
        totalWatchSeconds,
      },
      sessions: presentedSessions,
    });
  } catch (error) {
    console.error("Could not load Watch Together room detail:", error.message);
    return res.status(500).json({ success: false, message: "Could not load this room activity." });
  }
};
