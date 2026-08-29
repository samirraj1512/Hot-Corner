export const isRoomHost = (room, userId) => room.hostId === userId;

export const canControlRoom = (room, userId) => isRoomHost(room, userId);

const presentMessage = (message) => {
  const sentAt = new Date(message.sentAt).getTime();
  return {
    id: message.id,
    userId: message.userId,
    name: message.name,
    image: message.image || "",
    text: message.text,
    sentAt: Number.isFinite(sentAt) ? new Date(sentAt).toISOString() : new Date().toISOString(),
  };
};

export const presentWatchRoom = (room, userId) => ({
  id: room._id.toString(),
  code: room.code,
  host: {
    id: room.hostId,
    name: room.hostName,
    image: room.hostImage || "",
  },
  media: room.media,
  playback: {
    isPlaying: Boolean(room.playback?.isPlaying),
    currentTime: Number(room.playback?.currentTime || 0),
    updatedAt: room.playback?.updatedAt?.toISOString?.() || new Date().toISOString(),
  },
  messages: (room.messages || []).map(presentMessage),
  expiresAt: room.expiresAt.toISOString(),
  serverNow: new Date().toISOString(),
  isHost: isRoomHost(room, userId),
  canControl: canControlRoom(room, userId),
});
