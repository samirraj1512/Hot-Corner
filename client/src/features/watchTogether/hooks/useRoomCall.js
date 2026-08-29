import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const DEFAULT_ICE_CONFIG = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: "all",
  relayConfigured: false,
  relayStatus: "not-configured",
};
const ICE_SERVER_REFRESH_MS = 90 * 60 * 1000;
const PEER_DISCONNECT_GRACE_MS = 8_000;
const PEER_RESTART_DELAY_MS = 800;
const PEER_BOOTSTRAP_DELAY_MS = 3_000;
const REMOTE_MEDIA_START_TIMEOUT_MS = 10_000;
const REMOTE_MEDIA_STALL_GRACE_MS = 6_000;
const FRESH_PEER_DELAY_MS = 2_500;
const MAX_ICE_RESTARTS = 3;
const MAX_QUEUED_CANDIDATES = 128;

const getCameraConstraints = () => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
});

const shouldInitiatePeerConnection = (localSocketId, remoteSocketId) => (
  Boolean(localSocketId && remoteSocketId) && String(localSocketId).localeCompare(String(remoteSocketId)) < 0
);

export const useRoomCall = ({ socket, emitWithAck, roomJoinVersion, axios, getToken }) => {
  const peersRef = useRef(new Map());
  const peerCreationRef = useRef(new Map());
  const peerMetadataRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new Map());
  const queuedCandidatesRef = useRef(new Map());
  const inCallRef = useRef(false);
  const callJoinInFlightRef = useRef(false);
  const restartPeerRef = useRef(null);
  const iceConfigRef = useRef({ ...DEFAULT_ICE_CONFIG, fetchedAt: 0, request: null });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [inCall, setInCall] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [floatingCallVisible, setFloatingCallVisible] = useState(false);
  const [relayConfigured, setRelayConfigured] = useState(false);
  const [relayStatus, setRelayStatus] = useState("not-configured");
  const [error, setError] = useState("");

  const getPeerMetadata = useCallback((socketId) => {
    const existing = peerMetadataRef.current.get(socketId);
    if (existing) return existing;

    const metadata = {
      polite: String(socket?.id || "") > String(socketId),
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      restartAttempts: 0,
      recoveryTimer: null,
      mediaRecoveryTimer: null,
      bootstrapTimer: null,
      remoteVideoReady: false,
      remoteVideoTracks: new Set(),
      participant: null,
      operationChain: Promise.resolve(),
    };
    peerMetadataRef.current.set(socketId, metadata);
    return metadata;
  }, [socket?.id]);

  const clearConnectionRecovery = useCallback((socketId, { resetAttempts = false } = {}) => {
    const metadata = peerMetadataRef.current.get(socketId);
    if (!metadata) return;
    if (metadata.recoveryTimer) window.clearTimeout(metadata.recoveryTimer);
    metadata.recoveryTimer = null;
    if (resetAttempts) metadata.restartAttempts = 0;
  }, []);

  const clearMediaRecovery = useCallback((socketId) => {
    const metadata = peerMetadataRef.current.get(socketId);
    if (!metadata) return;
    if (metadata.mediaRecoveryTimer) window.clearTimeout(metadata.mediaRecoveryTimer);
    metadata.mediaRecoveryTimer = null;
  }, []);

  const updateRemoteStream = useCallback((socketId, stream, participant) => {
    remoteStreamRef.current.set(socketId, stream);
    setRemoteStreams((current) => ({
      ...current,
      [socketId]: {
        stream,
        participant: participant || current[socketId]?.participant,
      },
    }));
  }, []);

  const markRemoteVideoPlaying = useCallback((socketId) => {
    const metadata = getPeerMetadata(socketId);
    metadata.remoteVideoReady = true;
    clearMediaRecovery(socketId);
    clearConnectionRecovery(socketId, { resetAttempts: true });
    setError("");
  }, [clearConnectionRecovery, clearMediaRecovery, getPeerMetadata]);

  const reportRemoteVideoStalled = useCallback((socketId, delay = REMOTE_MEDIA_STALL_GRACE_MS) => {
    const peer = peersRef.current.get(socketId);
    const metadata = getPeerMetadata(socketId);
    if (!peer || metadata.mediaRecoveryTimer || peer.connectionState === "closed") return;

    metadata.remoteVideoReady = false;
    metadata.mediaRecoveryTimer = window.setTimeout(() => {
      metadata.mediaRecoveryTimer = null;
      if (!inCallRef.current || peersRef.current.get(socketId) !== peer || metadata.remoteVideoReady) return;
      setError("Room call video is reconnecting.");
      restartPeerRef.current?.(socketId);
    }, delay);
  }, [getPeerMetadata]);

  const enqueuePeerOperation = useCallback((socketId, operation) => {
    const metadata = getPeerMetadata(socketId);
    const nextOperation = metadata.operationChain
      .catch(() => undefined)
      .then(operation);
    metadata.operationChain = nextOperation.catch(() => undefined);
    return nextOperation;
  }, [getPeerMetadata]);

  const closePeer = useCallback((socketId) => {
    const metadata = peerMetadataRef.current.get(socketId);
    if (metadata?.recoveryTimer) window.clearTimeout(metadata.recoveryTimer);
    if (metadata?.mediaRecoveryTimer) window.clearTimeout(metadata.mediaRecoveryTimer);
    if (metadata?.bootstrapTimer) window.clearTimeout(metadata.bootstrapTimer);
    metadata?.remoteVideoTracks.forEach((track) => {
      track.onunmute = null;
      track.onmute = null;
      track.onended = null;
    });
    peerMetadataRef.current.delete(socketId);
    peerCreationRef.current.delete(socketId);

    const peer = peersRef.current.get(socketId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.close();
      peersRef.current.delete(socketId);
    }
    queuedCandidatesRef.current.delete(socketId);
    remoteStreamRef.current.delete(socketId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[socketId];
      return next;
    });
  }, []);

  const closeAllPeers = useCallback(() => {
    const socketIds = new Set([
      ...peersRef.current.keys(),
      ...peerMetadataRef.current.keys(),
      ...peerCreationRef.current.keys(),
    ]);
    socketIds.forEach(closePeer);
  }, [closePeer]);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const loadIceConfig = useCallback(async ({ force = false } = {}) => {
    const cached = iceConfigRef.current;
    if (!force && cached.request) return cached.request;
    if (!force && cached.fetchedAt && Date.now() - cached.fetchedAt < ICE_SERVER_REFRESH_MS) {
      return cached;
    }

    const request = (async () => {
      try {
        if (!axios || !getToken) return DEFAULT_ICE_CONFIG;
        const token = await getToken({ skipCache: true });
        const { data } = await axios.get("/api/watch-together/ice-servers", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data?.success && Array.isArray(data.iceServers) && data.iceServers.length) {
          const nextConfig = {
            iceServers: data.iceServers,
            iceTransportPolicy: data.iceTransportPolicy === "relay" && data.relayConfigured ? "relay" : "all",
            relayConfigured: Boolean(data.relayConfigured),
            relayStatus: String(data.relayStatus || "not-configured"),
          };
          iceConfigRef.current = { ...nextConfig, fetchedAt: Date.now(), request: null };
          setRelayConfigured(nextConfig.relayConfigured);
          setRelayStatus(nextConfig.relayStatus);
          return nextConfig;
        }
      } catch {
        // The recovery path still lets an open network use STUN while the TURN endpoint comes back.
      } finally {
        iceConfigRef.current.request = null;
      }

      iceConfigRef.current = { ...DEFAULT_ICE_CONFIG, fetchedAt: Date.now(), request: null };
      setRelayConfigured(false);
      setRelayStatus("unavailable");
      return DEFAULT_ICE_CONFIG;
    })();
    iceConfigRef.current.request = request;
    return request;
  }, [axios, getToken]);

  const flushQueuedCandidates = useCallback(async (socketId, peer) => {
    const candidates = queuedCandidatesRef.current.get(socketId) || [];
    queuedCandidatesRef.current.delete(socketId);
    await Promise.all(candidates.map((candidate) => peer.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const sendSignal = useCallback((socketId, signal, attempt = 0) => {
    if (!socket?.connected || !inCallRef.current) return;
    const payload = { to: socketId, signal };
    if (signal.type === "candidate") {
      socket.emit("watch:webrtc-signal", payload);
      return;
    }

    socket.timeout(5_000).emit("watch:webrtc-signal", payload, (timeoutError, response) => {
      if ((!timeoutError && response?.ok) || attempt >= 1 || !inCallRef.current) return;
      window.setTimeout(() => sendSignal(socketId, signal, attempt + 1), PEER_RESTART_DELAY_MS);
    });
  }, [socket]);

  const createPeer = useCallback(async (socketId, participant) => {
    const existingPeer = peersRef.current.get(socketId);
    const metadata = getPeerMetadata(socketId);
    if (participant) metadata.participant = participant;
    if (existingPeer) return existingPeer;
    if (peerCreationRef.current.has(socketId)) return peerCreationRef.current.get(socketId);
    if (!localStreamRef.current) throw new Error("Join the call before connecting to other people.");

    const creation = (async () => {
      const iceConfig = await loadIceConfig();
      if (peerCreationRef.current.get(socketId) !== creation || !inCallRef.current) {
        throw new Error("The room call changed before the connection was ready.");
      }

      const peer = new RTCPeerConnection({
        iceServers: iceConfig.iceServers,
        iceTransportPolicy: iceConfig.iceTransportPolicy,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });
      peersRef.current.set(socketId, peer);
      if (metadata.bootstrapTimer) window.clearTimeout(metadata.bootstrapTimer);
      metadata.bootstrapTimer = null;
      localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));

      const scheduleConnectionRecovery = (immediate = false) => {
        if (metadata.recoveryTimer || peer.connectionState === "closed") return;
        metadata.recoveryTimer = window.setTimeout(() => {
          metadata.recoveryTimer = null;
          if (!inCallRef.current || peersRef.current.get(socketId) !== peer || peer.connectionState === "connected") return;
          restartPeerRef.current?.(socketId);
        }, immediate ? PEER_RESTART_DELAY_MS : PEER_DISCONNECT_GRACE_MS);
      };

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) sendSignal(socketId, { type: "candidate", candidate: candidate.toJSON?.() || candidate });
      };
      peer.ontrack = ({ streams, track }) => {
        let stream = streams?.[0] || remoteStreamRef.current.get(socketId);
        if (!stream) stream = new MediaStream();
        if (track && !stream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
          stream.addTrack(track);
        }
        updateRemoteStream(socketId, stream, metadata.participant);

        if (track?.kind === "video") {
          metadata.remoteVideoTracks.add(track);
          let hasUnmuted = !track.muted;
          const onVideoReady = () => {
            hasUnmuted = true;
            markRemoteVideoPlaying(socketId);
          };
          if (hasUnmuted) markRemoteVideoPlaying(socketId);
          track.onunmute = onVideoReady;
          track.onmute = () => {
            if (hasUnmuted) reportRemoteVideoStalled(socketId);
          };
          track.onended = () => reportRemoteVideoStalled(socketId, PEER_RESTART_DELAY_MS);
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          clearConnectionRecovery(socketId);
          if (!metadata.remoteVideoReady) reportRemoteVideoStalled(socketId, REMOTE_MEDIA_START_TIMEOUT_MS);
          return;
        }
        if (peer.connectionState === "closed") {
          closePeer(socketId);
          return;
        }
        if (peer.connectionState === "failed") scheduleConnectionRecovery(true);
        if (peer.connectionState === "disconnected") scheduleConnectionRecovery(false);
      };
      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
          clearConnectionRecovery(socketId);
          if (!metadata.remoteVideoReady) reportRemoteVideoStalled(socketId, REMOTE_MEDIA_START_TIMEOUT_MS);
        } else if (peer.iceConnectionState === "failed") {
          scheduleConnectionRecovery(true);
        } else if (peer.iceConnectionState === "disconnected") {
          scheduleConnectionRecovery(false);
        }
      };
      return peer;
    })();

    peerCreationRef.current.set(socketId, creation);
    try {
      return await creation;
    } finally {
      if (peerCreationRef.current.get(socketId) === creation) peerCreationRef.current.delete(socketId);
    }
  }, [clearConnectionRecovery, closePeer, getPeerMetadata, loadIceConfig, markRemoteVideoPlaying, reportRemoteVideoStalled, sendSignal, updateRemoteStream]);

  const createOffer = useCallback(async (socketId, participant, { iceRestart = false } = {}) => {
    if (!socketId || socketId === socket?.id) return false;
    const peer = await createPeer(socketId, participant);
    return enqueuePeerOperation(socketId, async () => {
      if (!inCallRef.current || peersRef.current.get(socketId) !== peer || peer.signalingState !== "stable") {
        return false;
      }

      const metadata = getPeerMetadata(socketId);
      metadata.makingOffer = true;
      try {
        const offer = await peer.createOffer(iceRestart ? { iceRestart: true } : undefined);
        await peer.setLocalDescription(offer);
        sendSignal(socketId, { type: "offer", sdp: offer.sdp });
        return true;
      } finally {
        metadata.makingOffer = false;
      }
    });
  }, [createPeer, enqueuePeerOperation, getPeerMetadata, sendSignal, socket?.id]);

  const schedulePeerBootstrap = useCallback((socketId, participant) => {
    if (!socketId || socketId === socket?.id || peersRef.current.has(socketId)) return;
    const metadata = getPeerMetadata(socketId);
    if (participant) metadata.participant = participant;
    if (metadata.bootstrapTimer) return;

    metadata.bootstrapTimer = window.setTimeout(() => {
      metadata.bootstrapTimer = null;
      if (!inCallRef.current || peersRef.current.has(socketId)) return;
      void createOffer(socketId, metadata.participant);
    }, PEER_BOOTSTRAP_DELAY_MS);
  }, [createOffer, getPeerMetadata, socket?.id]);

  const restartPeer = useCallback(async (socketId) => {
    const peer = peersRef.current.get(socketId);
    if (!peer || !socket?.connected || !inCallRef.current) return;

    const metadata = getPeerMetadata(socketId);
    clearMediaRecovery(socketId);
    metadata.remoteVideoReady = false;
    if (metadata.restartAttempts >= MAX_ICE_RESTARTS) {
      closePeer(socketId);
      setError("Trying to rebuild the room call connection.");
      window.setTimeout(() => {
        if (inCallRef.current && socket?.connected) void createOffer(socketId, metadata.participant, { iceRestart: true });
      }, FRESH_PEER_DELAY_MS);
      return;
    }

    metadata.restartAttempts += 1;
    try {
      const iceConfig = await loadIceConfig({ force: true });
      if (peersRef.current.get(socketId) !== peer || !inCallRef.current) return;
      peer.setConfiguration({
        iceServers: iceConfig.iceServers,
        iceTransportPolicy: iceConfig.iceTransportPolicy,
      });
      const offerWasCreated = await createOffer(socketId, metadata.participant, { iceRestart: true });
      if (!offerWasCreated && !metadata.recoveryTimer) {
        metadata.recoveryTimer = window.setTimeout(() => {
          metadata.recoveryTimer = null;
          restartPeerRef.current?.(socketId);
        }, PEER_RESTART_DELAY_MS);
      }
    } catch {
      setError("The room call is reconnecting. Your camera and microphone will stay on.");
      if (!metadata.recoveryTimer) {
        metadata.recoveryTimer = window.setTimeout(() => {
          metadata.recoveryTimer = null;
          restartPeerRef.current?.(socketId);
        }, PEER_DISCONNECT_GRACE_MS);
      }
    }
  }, [clearMediaRecovery, closePeer, createOffer, getPeerMetadata, loadIceConfig, socket]);

  useEffect(() => {
    restartPeerRef.current = restartPeer;
    return () => { restartPeerRef.current = null; };
  }, [restartPeer]);

  const handleSignal = useCallback(async ({ from, participant, signal }) => {
    if (!signal || !from || from === socket?.id || !inCallRef.current) return;
    try {
      if (signal.type === "candidate") {
        const peer = peersRef.current.get(from);
        const metadata = getPeerMetadata(from);
        if (metadata.ignoreOffer) return;
        if (!peer || !peer.remoteDescription) {
          const queued = queuedCandidatesRef.current.get(from) || [];
          queued.push(signal.candidate);
          if (queued.length > MAX_QUEUED_CANDIDATES) queued.splice(0, queued.length - MAX_QUEUED_CANDIDATES);
          queuedCandidatesRef.current.set(from, queued);
          return;
        }
        await enqueuePeerOperation(from, () => peer.addIceCandidate(signal.candidate).catch(() => undefined));
        return;
      }

      const peer = await createPeer(from, participant);
      await enqueuePeerOperation(from, async () => {
        if (peersRef.current.get(from) !== peer) return;
        const metadata = getPeerMetadata(from);
        if (participant) metadata.participant = participant;

        if (signal.type === "offer") {
          const readyForOffer = !metadata.makingOffer
            && (peer.signalingState === "stable" || metadata.isSettingRemoteAnswerPending);
          const offerCollision = !readyForOffer;
          metadata.ignoreOffer = !metadata.polite && offerCollision;
          if (metadata.ignoreOffer) return;
          if (offerCollision && peer.signalingState === "have-local-offer") {
            await peer.setLocalDescription({ type: "rollback" });
          } else if (offerCollision && peer.signalingState !== "stable") {
            return;
          }

          await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          await flushQueuedCandidates(from, peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal(from, { type: "answer", sdp: answer.sdp });
        } else if (signal.type === "answer") {
          if (peer.signalingState !== "have-local-offer") return;
          metadata.isSettingRemoteAnswerPending = true;
          try {
            await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
            await flushQueuedCandidates(from, peer);
          } finally {
            metadata.isSettingRemoteAnswerPending = false;
          }
        }
      });
    } catch (signalError) {
      setError(signalError.message || "A video call connection could not be completed.");
      restartPeerRef.current?.(from);
    }
  }, [createPeer, enqueuePeerOperation, flushQueuedCandidates, getPeerMetadata, sendSignal, socket?.id]);

  const joinSocketCall = useCallback(async () => {
    setInCall(true);
    inCallRef.current = true;
    try {
      const response = await emitWithAck("watch:call-join");
      const existingSockets = [...new Set(Array.isArray(response.existingSockets) ? response.existingSockets : [])]
        .filter((socketId) => socketId && socketId !== socket?.id);
      await Promise.all(existingSockets
        .filter((socketId) => shouldInitiatePeerConnection(socket?.id, socketId))
        .map((socketId) => createOffer(socketId)));
      existingSockets
        .filter((socketId) => !shouldInitiatePeerConnection(socket?.id, socketId))
        .forEach((socketId) => schedulePeerBootstrap(socketId));
      return response;
    } catch (error) {
      inCallRef.current = false;
      setInCall(false);
      throw error;
    }
  }, [createOffer, emitWithAck, schedulePeerBootstrap, socket?.id]);

  const joinCall = useCallback(async () => {
    setError("");
    try {
      const iceConfig = await loadIceConfig({ force: true });
      if (iceConfig.relayStatus === "unavailable") {
        setError("The room call relay is unavailable. Video can be blocked on this network until TURN is configured.");
      }
      let stream = localStreamRef.current;
      if (!stream) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot start a camera or microphone call.");
        stream = await navigator.mediaDevices.getUserMedia(getCameraConstraints());
        localStreamRef.current = stream;
        setLocalStream(stream);
        setAudioEnabled(true);
        setVideoEnabled(true);
      }

      await joinSocketCall();
    } catch (callError) {
      await emitWithAck("watch:call-leave").catch(() => undefined);
      stopLocalStream();
      inCallRef.current = false;
      setInCall(false);
      setError(callError.message || "Could not join the video call.");
      throw callError;
    }
  }, [emitWithAck, joinSocketCall, loadIceConfig, stopLocalStream]);

  const rejoinRoomCall = useCallback(async () => {
    if (!inCallRef.current || !localStreamRef.current || callJoinInFlightRef.current) return;

    callJoinInFlightRef.current = true;
    try {
      closeAllPeers();
      await joinSocketCall();
      setError("");
    } catch {
      setError("Room call reconnecting. Your camera and microphone will stay on.");
    } finally {
      callJoinInFlightRef.current = false;
    }
  }, [closeAllPeers, joinSocketCall]);

  const leaveCall = useCallback(async () => {
    inCallRef.current = false;
    callJoinInFlightRef.current = false;
    try {
      await emitWithAck("watch:call-leave");
    } catch {
      // Local media must still stop when a temporary network failure prevents the acknowledgement.
    }
    closeAllPeers();
    stopLocalStream();
    setInCall(false);
    setFloatingCallVisible(false);
  }, [closeAllPeers, emitWithAck, stopLocalStream]);

  const toggleAudio = useCallback(() => {
    const nextEnabled = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = nextEnabled; });
    setAudioEnabled(nextEnabled);
  }, [audioEnabled]);

  const toggleVideo = useCallback(() => {
    const nextEnabled = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
    setVideoEnabled(nextEnabled);
  }, [videoEnabled]);

  useEffect(() => {
    if (!socket) return undefined;
    const onSocketDisconnect = () => {
      if (!inCallRef.current) return;
      closeAllPeers();
      setError("Room call reconnecting. Your camera and microphone will stay on.");
    };
    const connectPeer = (socketId, participant) => {
      if (!inCallRef.current || !socketId || socketId === socket.id || peersRef.current.has(socketId)) return;
      if (shouldInitiatePeerConnection(socket.id, socketId)) void createOffer(socketId, participant);
      else schedulePeerBootstrap(socketId, participant);
    };
    const onCallParticipantJoined = ({ socketId, participant }) => connectPeer(socketId, participant);
    const onCallState = ({ socketIds = [] }) => {
      if (!inCallRef.current || !Array.isArray(socketIds)) return;
      const activeSocketIds = new Set(socketIds);
      [...peersRef.current.keys()]
        .filter((socketId) => !activeSocketIds.has(socketId))
        .forEach(closePeer);
      activeSocketIds.forEach((socketId) => connectPeer(socketId));
    };
    socket.on("watch:webrtc-signal", handleSignal);
    socket.on("watch:call-participant-joined", onCallParticipantJoined);
    socket.on("watch:call-participant-left", ({ socketId }) => closePeer(socketId));
    socket.on("watch:call-state", onCallState);
    socket.on("disconnect", onSocketDisconnect);
    return () => {
      socket.off("watch:webrtc-signal", handleSignal);
      socket.off("watch:call-participant-joined", onCallParticipantJoined);
      socket.off("watch:call-participant-left");
      socket.off("watch:call-state", onCallState);
      socket.off("disconnect", onSocketDisconnect);
    };
  }, [closeAllPeers, closePeer, createOffer, handleSignal, schedulePeerBootstrap, socket]);

  useEffect(() => {
    void rejoinRoomCall();
  }, [rejoinRoomCall, roomJoinVersion]);

  useEffect(() => () => {
    inCallRef.current = false;
    callJoinInFlightRef.current = false;
    closeAllPeers();
    stopLocalStream();
  }, [closeAllPeers, stopLocalStream]);

  return {
    localStream,
    remoteStreams: Object.entries(remoteStreams).map(([socketId, value]) => ({ socketId, ...value })),
    inCall,
    audioEnabled,
    videoEnabled,
    floatingCallVisible,
    relayConfigured,
    relayStatus,
    error,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    markRemoteVideoPlaying,
    reportRemoteVideoStalled,
    setFloatingCallVisible,
  };
};
