const PRESENCE_KEY_PREFIX = "watch-together:presence:";
const CALL_KEY_PREFIX = "watch-together:call:";
// Background tabs can throttle timers heavily. Socket.IO still detects a truly
// closed connection, so leave enough room for a healthy tab to send its next heartbeat.
const DEFAULT_STALE_CONNECTION_MS = 120_000;
const STATE_TTL_SECONDS = 8 * 24 * 60 * 60;

const now = () => Date.now();
const presenceKey = (roomCode) => `${PRESENCE_KEY_PREFIX}${roomCode}`;
const callKey = (roomCode) => `${CALL_KEY_PREFIX}${roomCode}`;

const safeParse = (value) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const isLiveParticipant = (participant, currentTime, staleConnectionMs) => {
  if (!participant?.socketId || !participant?.userId) return false;
  if (participant.connected === false) return Number(participant.expiresAt || 0) > currentTime;
  return currentTime - Number(participant.lastSeen || 0) <= staleConnectionMs;
};

const isLiveCallParticipant = (participant, currentTime, staleConnectionMs) => (
  Boolean(participant?.socketId) && currentTime - Number(participant.lastSeen || 0) <= staleConnectionMs
);

export class MemoryRoomRealtimeState {
  constructor({ staleConnectionMs = DEFAULT_STALE_CONNECTION_MS } = {}) {
    this.staleConnectionMs = staleConnectionMs;
    this.presence = new Map();
    this.calls = new Map();
  }

  getPresence(roomCode) {
    if (!this.presence.has(roomCode)) this.presence.set(roomCode, new Map());
    return this.presence.get(roomCode);
  }

  getCalls(roomCode) {
    if (!this.calls.has(roomCode)) this.calls.set(roomCode, new Map());
    return this.calls.get(roomCode);
  }

  async upsertParticipant(roomCode, participant) {
    this.getPresence(roomCode).set(participant.socketId, {
      ...participant,
      connected: true,
      expiresAt: 0,
      lastSeen: now(),
    });
  }

  async markParticipantDisconnected(roomCode, socketId, graceMs) {
    const participant = this.presence.get(roomCode)?.get(socketId);
    if (!participant) return;
    participant.connected = false;
    participant.lastSeen = now();
    participant.expiresAt = now() + Math.max(0, Number(graceMs) || 0);
  }

  async removeParticipant(roomCode, socketId) {
    const roomPresence = this.presence.get(roomCode);
    roomPresence?.delete(socketId);
    if (roomPresence?.size === 0) this.presence.delete(roomCode);
  }

  async listParticipants(roomCode) {
    const roomPresence = this.presence.get(roomCode);
    if (!roomPresence) return [];

    const currentTime = now();
    const participants = [];
    for (const [socketId, participant] of roomPresence) {
      if (isLiveParticipant(participant, currentTime, this.staleConnectionMs)) participants.push(participant);
      else roomPresence.delete(socketId);
    }
    if (roomPresence.size === 0) this.presence.delete(roomCode);
    return participants;
  }

  async joinCall(roomCode, socketId) {
    const existingSockets = await this.listCallParticipants(roomCode);
    this.getCalls(roomCode).set(socketId, { socketId, lastSeen: now() });
    return existingSockets.filter((id) => id !== socketId);
  }

  async leaveCall(roomCode, socketId) {
    const roomCalls = this.calls.get(roomCode);
    roomCalls?.delete(socketId);
    if (roomCalls?.size === 0) this.calls.delete(roomCode);
  }

  async listCallParticipants(roomCode) {
    const roomCalls = this.calls.get(roomCode);
    if (!roomCalls) return [];

    const currentTime = now();
    const socketIds = [];
    for (const [socketId, participant] of roomCalls) {
      if (isLiveCallParticipant(participant, currentTime, this.staleConnectionMs)) socketIds.push(socketId);
      else roomCalls.delete(socketId);
    }
    if (roomCalls.size === 0) this.calls.delete(roomCode);
    return socketIds;
  }

  async touch(roomCode, socketId) {
    const currentTime = now();
    const participant = this.presence.get(roomCode)?.get(socketId);
    if (participant) participant.lastSeen = currentTime;
    const callParticipant = this.calls.get(roomCode)?.get(socketId);
    if (callParticipant) callParticipant.lastSeen = currentTime;
  }
}

export class RedisRoomRealtimeState {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.memory = new MemoryRoomRealtimeState(options);
    this.staleConnectionMs = this.memory.staleConnectionMs;
  }

  async writeHash(key, field, value) {
    await this.redis.hSet(key, field, JSON.stringify(value));
    await this.redis.expire(key, STATE_TTL_SECONDS);
  }

  async readLiveEntries(key, matcher) {
    const fields = await this.redis.hGetAll(key);
    const currentTime = now();
    const staleFields = [];
    const entries = [];

    for (const [field, value] of Object.entries(fields)) {
      const parsed = safeParse(value);
      if (matcher(parsed, currentTime, this.staleConnectionMs)) entries.push(parsed);
      else staleFields.push(field);
    }

    if (staleFields.length) await this.redis.hDel(key, ...staleFields);
    return entries;
  }

  async fallback(method, args, action) {
    try {
      return await action();
    } catch (error) {
      console.error(`Watch Together Redis ${method} failed; using this instance until Redis recovers.`, error.message);
      return this.memory[method](...args);
    }
  }

  async upsertParticipant(roomCode, participant) {
    await this.memory.upsertParticipant(roomCode, participant);
    const record = {
      ...participant,
      connected: true,
      expiresAt: 0,
      lastSeen: now(),
    };
    return this.fallback("upsertParticipant", [roomCode, participant], () => this.writeHash(
      presenceKey(roomCode),
      participant.socketId,
      record,
    ));
  }

  async markParticipantDisconnected(roomCode, socketId, graceMs) {
    await this.memory.markParticipantDisconnected(roomCode, socketId, graceMs);
    return this.fallback("markParticipantDisconnected", [roomCode, socketId, graceMs], async () => {
      const key = presenceKey(roomCode);
      const rawRecord = await this.redis.hGet(key, socketId);
      const record = safeParse(rawRecord);
      if (!record) return;
      const currentTime = now();
      await this.writeHash(key, socketId, {
        ...record,
        connected: false,
        lastSeen: currentTime,
        expiresAt: currentTime + Math.max(0, Number(graceMs) || 0),
      });
    });
  }

  async removeParticipant(roomCode, socketId) {
    await this.memory.removeParticipant(roomCode, socketId);
    return this.fallback("removeParticipant", [roomCode, socketId], () => this.redis.hDel(presenceKey(roomCode), socketId));
  }

  async listParticipants(roomCode) {
    const localParticipants = await this.memory.listParticipants(roomCode);
    return this.fallback("listParticipants", [roomCode], async () => this.readLiveEntries(
      presenceKey(roomCode),
      isLiveParticipant,
    )).then((participants) => participants || localParticipants);
  }

  async joinCall(roomCode, socketId) {
    const localExistingSockets = await this.memory.joinCall(roomCode, socketId);
    return this.fallback("joinCall", [roomCode, socketId], async () => {
      const existingSockets = await this.listCallParticipants(roomCode);
      await this.writeHash(callKey(roomCode), socketId, { socketId, lastSeen: now() });
      return existingSockets.filter((id) => id !== socketId);
    }).then((socketIds) => socketIds || localExistingSockets);
  }

  async leaveCall(roomCode, socketId) {
    await this.memory.leaveCall(roomCode, socketId);
    return this.fallback("leaveCall", [roomCode, socketId], () => this.redis.hDel(callKey(roomCode), socketId));
  }

  async listCallParticipants(roomCode) {
    const localSocketIds = await this.memory.listCallParticipants(roomCode);
    return this.fallback("listCallParticipants", [roomCode], async () => {
      const entries = await this.readLiveEntries(callKey(roomCode), isLiveCallParticipant);
      return entries.map((participant) => participant.socketId);
    }).then((socketIds) => socketIds || localSocketIds);
  }

  async touch(roomCode, socketId) {
    await this.memory.touch(roomCode, socketId);
    return this.fallback("touch", [roomCode, socketId], async () => {
      const currentTime = now();
      const updateLastSeen = async (key) => {
        const rawRecord = await this.redis.hGet(key, socketId);
        const record = safeParse(rawRecord);
        if (record) await this.writeHash(key, socketId, { ...record, lastSeen: currentTime });
      };
      await Promise.all([updateLastSeen(presenceKey(roomCode)), updateLastSeen(callKey(roomCode))]);
    });
  }
}

export const createRoomRealtimeState = ({ redisClient, staleConnectionMs } = {}) => (
  redisClient
    ? new RedisRoomRealtimeState(redisClient, { staleConnectionMs })
    : new MemoryRoomRealtimeState({ staleConnectionMs })
);
