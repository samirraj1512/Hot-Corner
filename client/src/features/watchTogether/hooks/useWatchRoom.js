import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const getSocketUrl = () => import.meta.env.VITE_BASE_URL || window.location.origin;
const MAX_ROOM_MESSAGES = 100;
const MAX_SOCKET_AUTH_RETRY_DELAY_MS = 15_000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;

const isAuthenticationError = (socketError) => /authentication|unauthori[sz]ed|token/i.test(socketError?.message || "");
const browserIsOnline = () => typeof navigator === "undefined" || navigator.onLine;

const createProfile = (user) => ({
  displayName: user?.fullName || user?.firstName || "Movie fan",
  image: user?.imageUrl || "",
});

const toClientPlayback = (playback, serverNow, forceSync = false) => {
  if (!playback?.updatedAt) return playback;

  const serverTime = new Date(serverNow).getTime();
  const updatedAt = new Date(playback.updatedAt).getTime();
  const clockOffset = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;

  return {
    ...playback,
    updatedAt: Number.isFinite(updatedAt)
      ? new Date(updatedAt - clockOffset).toISOString()
      : playback.updatedAt,
    forceSync: Boolean(forceSync),
  };
};

const toClientRoom = (room) => room ? {
  ...room,
  playback: toClientPlayback(room.playback, room.serverNow),
} : room;

const mergeMessages = (current = [], incoming = []) => {
  const byId = new Map();
  [...current, ...incoming].forEach((message) => {
    if (message?.id) byId.set(message.id, message);
  });

  return [...byId.values()]
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
    .slice(-MAX_ROOM_MESSAGES);
};

export const useWatchRoom = ({ roomCode, axios, getToken, user }) => {
  const profile = useMemo(() => createProfile(user), [user]);
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [callActive, setCallActive] = useState(false);
  const [roomJoinVersion, setRoomJoinVersion] = useState(0);

  const getAuthorization = useCallback(async () => ({
    headers: { Authorization: `Bearer ${await getToken()}` },
  }), [getToken]);

  useEffect(() => {
    if (!roomCode || !user) return undefined;
    let active = true;

    const loadRoom = async () => {
      setIsLoading(true);
      setError("");
      setRoom(null);
      setParticipants([]);
      setMessages([]);
      try {
        const config = await getAuthorization();
        const { data } = await axios.post(
          `/api/watch-together/rooms/${encodeURIComponent(roomCode)}/join`,
          profile,
          config,
        );
        if (!data.success) throw new Error(data.message || "Could not open this room.");
        if (active) {
          const loadedRoom = toClientRoom(data.room);
          setRoom(loadedRoom);
          setMessages((current) => mergeMessages(current, loadedRoom.messages));
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || requestError.message || "Could not open this room.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadRoom();
    return () => { active = false; };
  }, [axios, getAuthorization, profile, roomCode, user]);

  useEffect(() => {
    if (!roomCode || !user) return undefined;
    let disposed = false;
    let socketInstance;
    let authenticationRetries = 0;
    let reconnectTimer;
    let presenceHeartbeatId;

    const setOfflineState = () => {
      setConnectionStatus("offline");
      setError("Your internet connection is offline. The room will reconnect when it returns.");
    };

    const scheduleReconnect = (delay = 0) => {
      if (disposed || !browserIsOnline()) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        if (!disposed && !socketInstance?.connected) socketInstance?.connect();
      }, delay);
    };

    const resolveSocketAuth = (callback) => {
      getToken({ skipCache: true })
        .then((token) => callback(token ? { token } : {}))
        .catch(() => callback({}));
    };

    socketInstance = io(getSocketUrl(), {
      autoConnect: false,
      auth: resolveSocketAuth,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.3,
      timeout: 20000,
    });
    socketRef.current = socketInstance;
    setSocket(socketInstance);

    const onConnect = () => {
      authenticationRetries = 0;
      window.clearTimeout(reconnectTimer);
      setConnectionStatus("connected");
      setError("");
      socketInstance.emit("watch:join", { roomCode, ...profile }, (response) => {
        if (!response?.ok) {
          setConnectionStatus("error");
          setError(response?.error || "Could not join the live room.");
          return;
        }
        const joinedRoom = toClientRoom(response.room);
        setRoom(joinedRoom);
        setParticipants(response.participants || []);
        setMessages((current) => mergeMessages(current, joinedRoom.messages));
        setCallActive(Boolean(response.callActive));
        setRoomJoinVersion((version) => version + 1);
      });
    };

    const onConnectError = (socketError) => {
      if (disposed) return;
      if (!browserIsOnline()) {
        setOfflineState();
        return;
      }

      if (isAuthenticationError(socketError)) {
        authenticationRetries += 1;
        setConnectionStatus("connecting");
        setError(authenticationRetries > 1 ? "Refreshing your sign-in and reconnecting to the room." : "");
        scheduleReconnect(Math.min(
          750 * (2 ** Math.max(authenticationRetries - 1, 0)),
          MAX_SOCKET_AUTH_RETRY_DELAY_MS,
        ));
        return;
      }

      setConnectionStatus("error");
      setError(socketError.message || "The live room could not connect.");
    };

    const onDisconnect = (reason) => {
      if (disposed) return;
      if (!browserIsOnline()) {
        setOfflineState();
        return;
      }

      setConnectionStatus("connecting");
      if (reason !== "io client disconnect") scheduleReconnect(750);
    };

    const onReconnectAttempt = () => {
      if (!disposed && browserIsOnline()) setConnectionStatus("connecting");
    };
    const onOnline = () => {
      authenticationRetries = 0;
      setConnectionStatus("connecting");
      setError("");
      scheduleReconnect();
    };
    const onOffline = () => {
      window.clearTimeout(reconnectTimer);
      setOfflineState();
      socketInstance.disconnect();
    };
    const sendPresenceHeartbeat = () => {
      if (socketInstance?.connected) socketInstance.emit("watch:presence-heartbeat");
    };

    socketInstance.on("connect", onConnect);
    socketInstance.on("connect_error", onConnectError);
    socketInstance.on("disconnect", onDisconnect);
    socketInstance.io.on("reconnect_attempt", onReconnectAttempt);
    socketInstance.on("watch:participants", setParticipants);
    socketInstance.on("watch:chat", (message) => {
      setMessages((current) => mergeMessages(current, [message]));
    });
    socketInstance.on("watch:playback", ({ playback, forceSync, serverNow }) => {
      if (playback) {
        setRoom((current) => current ? {
          ...current,
          playback: toClientPlayback(playback, serverNow, forceSync),
        } : current);
      }
    });
    socketInstance.on("watch:media", ({ room: updatedRoom }) => {
      if (updatedRoom) setRoom(toClientRoom(updatedRoom));
    });
    socketInstance.on("watch:call-state", ({ active }) => setCallActive(Boolean(active)));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if (browserIsOnline()) socketInstance.connect();
    else setOfflineState();
    presenceHeartbeatId = window.setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(presenceHeartbeatId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      socketInstance?.io.off("reconnect_attempt", onReconnectAttempt);
      socketInstance?.disconnect();
      if (socketRef.current === socketInstance) socketRef.current = null;
    };
  }, [getToken, profile, roomCode, user]);

  const emitWithAck = useCallback((event, payload = {}) => new Promise((resolve, reject) => {
    const currentSocket = socketRef.current;
    if (!currentSocket?.connected) {
      reject(new Error("The live room is reconnecting. Please try again in a moment."));
      return;
    }

    currentSocket.timeout(10000).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error("The room did not respond. Please try again."));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "That room action could not be completed."));
        return;
      }
      resolve(response);
    });
  }), []);

  const updatePlayback = useCallback(async (playback) => {
    const response = await emitWithAck("watch:playback", playback);
    if (response.playback) {
      setRoom((current) => current ? {
        ...current,
        playback: toClientPlayback(response.playback, response.serverNow, playback.forceSync),
      } : current);
    }
    return response;
  }, [emitWithAck]);

  const updateMedia = useCallback(async (media) => {
    const response = await emitWithAck("watch:media", { media });
    if (response.room) setRoom(toClientRoom(response.room));
    return response;
  }, [emitWithAck]);

  const sendMessage = useCallback(async (text) => emitWithAck("watch:chat", { text }), [emitWithAck]);

  return {
    room,
    participants,
    messages,
    isLoading,
    error,
    connectionStatus,
    callActive,
    roomJoinVersion,
    socket,
    profile,
    updatePlayback,
    updateMedia,
    sendMessage,
    emitWithAck,
  };
};
