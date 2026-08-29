import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { Expand, FastForward, LoaderCircle, Pause, Play, Rewind, VideoIcon, Volume2 } from "lucide-react";
import FloatingCallOverlay from "./FloatingCallOverlay";
import {
  formatPlaybackTime,
  getGoogleDriveStreamCandidates,
  getPlaybackSyncPlan,
} from "../lib/media";

const REMOTE_EVENT_SUPPRESSION_MS = 1200;
const DRIFT_CHECK_INTERVAL_MS = 1000;
const FULLSCREEN_TOOL_HIDE_DELAY_MS = 2400;

const MediaStage = ({
  room,
  onPlayback,
  onPrepareDriveMedia,
  preparingDriveMedia = false,
  drivePreparationStatus = "",
  call,
}) => {
  const playerRef = useRef(null);
  const driveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const suppressUntilRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const lastPlaybackStateRef = useRef(null);
  const lastReportedActionRef = useRef({ key: "", sentAt: 0 });
  const scrubbingRef = useRef(false);
  const fullscreenTimerRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [driveStreamIndex, setDriveStreamIndex] = useState(0);
  const [driveFallback, setDriveFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenCall, setShowFullscreenCall] = useState(true);
  const [fullscreenToolsVisible, setFullscreenToolsVisible] = useState(false);
  const [error, setError] = useState("");

  const media = room.media;
  const isYoutube = media.source === "youtube";
  const isDrive = media.source === "drive";
  const driveStreamCandidates = useMemo(
    () => isYoutube ? [] : isDrive ? getGoogleDriveStreamCandidates(media) : [media.url].filter(Boolean),
    [isDrive, isYoutube, media],
  );
  const driveStreamUrl = driveStreamCandidates[driveStreamIndex] || media.url;
  const canControl = room.isHost && !(isDrive && driveFallback);
  const playback = room.playback;
  const inCall = Boolean(call?.inCall);
  const setFloatingCallVisible = call?.setFloatingCallVisible;

  const getCurrentTime = useCallback(() => {
    if (isYoutube) return Number(playerRef.current?.getCurrentTime?.() || 0);
    return Number(driveVideoRef.current?.currentTime || 0);
  }, [isYoutube]);

  const suppressLocalEvents = useCallback(() => {
    suppressUntilRef.current = Math.max(suppressUntilRef.current, Date.now() + REMOTE_EVENT_SUPPRESSION_MS);
  }, []);

  const setLocalPlaybackRate = useCallback((nextRate) => {
    const normalizedRate = nextRate === 1.5 || nextRate === 0.75 ? nextRate : 1;
    setPlaybackRate((current) => current === normalizedRate ? current : normalizedRate);

    const video = driveVideoRef.current;
    if (video && Math.abs(video.playbackRate - normalizedRate) > 0.01) {
      video.playbackRate = normalizedRate;
    }
  }, []);

  const syncPlayback = useCallback((forceSync = false) => {
    if (driveFallback) return;

    const plan = getPlaybackSyncPlan({
      playback,
      localTime: getCurrentTime(),
      duration,
      forceSync,
    });
    const playbackStateChanged = lastPlaybackStateRef.current !== playback.isPlaying;
    lastPlaybackStateRef.current = playback.isPlaying;
    setLocalPlaybackRate(plan.playbackRate);

    if (plan.shouldSeek || playbackStateChanged) suppressLocalEvents();

    if (plan.shouldSeek) {
      setCurrentTime(plan.targetTime);
      if (isYoutube) playerRef.current?.seekTo(plan.targetTime, "seconds");
      else if (driveVideoRef.current) driveVideoRef.current.currentTime = plan.targetTime;
    }

    if (!isYoutube) {
      const video = driveVideoRef.current;
      if (!video) return;

      if (playback.isPlaying && video.paused) {
        video.play().catch(() => setError("Interact with the video once to allow playback in this browser."));
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
      }
    }
  }, [driveFallback, duration, getCurrentTime, isYoutube, playback, setLocalPlaybackRate, suppressLocalEvents]);

  useEffect(() => {
    setDriveStreamIndex(0);
    setDriveFallback(false);
    setDuration(0);
    setCurrentTime(0);
    setPlaybackRate(1);
    setError("");
    lastPlaybackStateRef.current = null;
  }, [media.cloudinaryPublicId, media.driveFileId, media.source, media.url]);

  useEffect(() => {
    syncPlayback(Boolean(playback.forceSync));
  }, [playback.forceSync, playback.updatedAt, syncPlayback]);

  useEffect(() => {
    if (!playback.isPlaying || driveFallback) return undefined;

    const intervalId = window.setInterval(() => syncPlayback(false), DRIFT_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [driveFallback, playback.isPlaying, syncPlayback]);

  useEffect(() => {
    const video = driveVideoRef.current;
    if (video) video.volume = volume;
  }, [driveStreamUrl, volume]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const revealFullscreenTools = useCallback(() => {
    if (!isFullscreen) return;
    window.clearTimeout(fullscreenTimerRef.current);
    setFullscreenToolsVisible(true);
    fullscreenTimerRef.current = window.setTimeout(
      () => setFullscreenToolsVisible(false),
      FULLSCREEN_TOOL_HIDE_DELAY_MS,
    );
  }, [isFullscreen]);

  useEffect(() => {
    window.clearTimeout(fullscreenTimerRef.current);
    if (!isFullscreen) {
      setFullscreenToolsVisible(false);
      setShowFullscreenCall(true);
      return undefined;
    }

    setFullscreenToolsVisible(true);
    fullscreenTimerRef.current = window.setTimeout(
      () => setFullscreenToolsVisible(false),
      FULLSCREEN_TOOL_HIDE_DELAY_MS,
    );
    return () => window.clearTimeout(fullscreenTimerRef.current);
  }, [isFullscreen]);

  useEffect(() => {
    setFloatingCallVisible?.(Boolean(isFullscreen && showFullscreenCall && inCall));
  }, [inCall, isFullscreen, setFloatingCallVisible, showFullscreenCall]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    window.addEventListener("mousemove", revealFullscreenTools, { passive: true });
    return () => window.removeEventListener("mousemove", revealFullscreenTools);
  }, [isFullscreen, revealFullscreenTools]);

  const reportPlayback = useCallback(async ({ isPlaying, time = getCurrentTime(), forceSync = false }) => {
    if (!canControl || Date.now() < suppressUntilRef.current) return;

    const currentTimeValue = Math.max(0, Number(time || 0));
    const actionKey = `${isPlaying}:${currentTimeValue.toFixed(2)}:${forceSync}`;
    const now = Date.now();
    if (lastReportedActionRef.current.key === actionKey && now - lastReportedActionRef.current.sentAt < 250) return;

    lastReportedActionRef.current = { key: actionKey, sentAt: now };
    try {
      await onPlayback({ isPlaying, currentTime: currentTimeValue, forceSync });
      setError("");
    } catch (playbackError) {
      setError(playbackError.message || "Playback could not be synchronized.");
    }
  }, [canControl, getCurrentTime, onPlayback]);

  const movePlayerTo = useCallback((nextTime) => {
    const targetTime = Math.max(0, Math.min(Number(nextTime), duration || Number.MAX_SAFE_INTEGER));
    if (isYoutube) playerRef.current?.seekTo(targetTime, "seconds");
    else if (driveVideoRef.current) driveVideoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    return targetTime;
  }, [duration, isYoutube]);

  const seek = useCallback((nextTime) => {
    if (!canControl) return;
    const targetTime = movePlayerTo(nextTime);
    lastHeartbeatRef.current = Date.now();
    reportPlayback({ isPlaying: playback.isPlaying, time: targetTime, forceSync: true });
  }, [canControl, movePlayerTo, playback.isPlaying, reportPlayback]);

  const previewSeek = useCallback((nextTime) => {
    if (!canControl) return;
    movePlayerTo(nextTime);
  }, [canControl, movePlayerTo]);

  const finishScrubbing = useCallback((event) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    seek(event.currentTarget.value);
  }, [seek]);

  const reportProgress = useCallback((time) => {
    setCurrentTime(time);
    if (
      canControl
      && playback.isPlaying
      && !scrubbingRef.current
      && Date.now() - lastHeartbeatRef.current > 8000
    ) {
      lastHeartbeatRef.current = Date.now();
      reportPlayback({ isPlaying: true, time });
    }
  }, [canControl, playback.isPlaying, reportPlayback]);

  const handleDriveError = useCallback(() => {
    if (!isDrive) {
      setError("This shared video could not be played in the browser.");
      return;
    }
    if (driveStreamIndex < driveStreamCandidates.length - 1) {
      setDriveStreamIndex((current) => current + 1);
      setError("Trying another direct Google Drive stream.");
      return;
    }

    setDriveFallback(true);
    setError("This file only opens in Google Drive preview, which cannot be synchronized by a website.");
  }, [driveStreamCandidates.length, driveStreamIndex, isDrive]);

  const togglePlay = () => reportPlayback({ isPlaying: !playback.isPlaying });

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen?.();
      else await stageRef.current?.requestFullscreen?.();
    } catch {
      setError("Fullscreen is not available in this browser.");
    }
  };

  const toggleFullscreenCall = async () => {
    revealFullscreenTools();
    if (!inCall) {
      try {
        await call?.joinCall();
        setShowFullscreenCall(true);
      } catch (callError) {
        setError(callError.message || "Could not join the room call.");
      }
      return;
    }
    setShowFullscreenCall((current) => !current);
  };

  const callButtonLabel = inCall
    ? showFullscreenCall ? "Hide room call" : "Show room call"
    : "Join room call";

  return (
    <section className="border border-white/10 bg-white/[0.025] rounded-lg overflow-hidden">
      <div className="min-h-14 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-medium">{media.title}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{isYoutube ? "YouTube" : isDrive ? "Google Drive" : "Shared video"}</p>
        </div>
        <span className={`text-xs ${room.isHost && !driveFallback ? "text-primary" : "text-gray-500"}`}>
          {isDrive && driveFallback ? "Drive preview cannot sync" : room.isHost ? "You control playback" : "Room creator controls"}
        </span>
      </div>

      <div
        ref={stageRef}
        className="relative aspect-video bg-black"
        onMouseMove={revealFullscreenTools}
        onTouchStart={revealFullscreenTools}
      >
        {isYoutube ? (
          <ReactPlayer
            ref={playerRef}
            url={media.url}
            playing={Boolean(playback.isPlaying)}
            playbackRate={playbackRate}
            volume={volume}
            width="100%"
            height="100%"
            className="absolute inset-0"
            controls={false}
            onReady={() => syncPlayback(Boolean(playback.forceSync))}
            onDuration={setDuration}
            onProgress={({ playedSeconds }) => reportProgress(playedSeconds)}
            onPlay={() => reportPlayback({ isPlaying: true })}
            onPause={() => reportPlayback({ isPlaying: false })}
            onEnded={() => reportPlayback({ isPlaying: false, time: duration, forceSync: true })}
            onError={() => setError("This YouTube video cannot be played in an embedded room.")}
          />
        ) : isDrive && driveFallback ? (
          <iframe
            title={media.title}
            src={media.previewUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        ) : (
          <video
            key={driveStreamUrl}
            ref={driveVideoRef}
            src={driveStreamUrl}
            className="w-full h-full object-contain"
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration || 0);
              syncPlayback(Boolean(playback.forceSync));
            }}
            onTimeUpdate={(event) => reportProgress(event.currentTarget.currentTime)}
            onPlay={() => reportPlayback({ isPlaying: true })}
            onPause={() => reportPlayback({ isPlaying: false })}
            onEnded={(event) => reportPlayback({
              isPlaying: false,
              time: event.currentTarget.duration || duration,
              forceSync: true,
            })}
            onError={handleDriveError}
          />
        )}

        {isDrive && driveFallback && !isFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Open Watch Together fullscreen"
            aria-label="Open Watch Together fullscreen"
            className="absolute right-3 bottom-3 z-40 w-9 h-9 flex items-center justify-center border border-white/30 bg-black/65 hover:border-primary transition rounded-lg cursor-pointer"
          >
            <Expand className="w-4 h-4" />
          </button>
        )}
        {isFullscreen && call && (
          <div
            className="absolute top-0 right-0 z-40 w-16 h-16"
            onMouseMove={revealFullscreenTools}
            onTouchStart={revealFullscreenTools}
          >
            <button
              type="button"
              onClick={toggleFullscreenCall}
              title={callButtonLabel}
              aria-label={callButtonLabel}
              className={`absolute top-3 right-3 w-8 h-8 flex items-center justify-center border border-white/30 bg-black/65 hover:border-primary transition rounded-lg cursor-pointer ${fullscreenToolsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isFullscreen && inCall && showFullscreenCall && (
          <FloatingCallOverlay call={call} containerRef={stageRef} />
        )}
      </div>

      {isDrive && driveFallback ? (
        <div className="px-4 py-3 border-t border-white/10 text-xs text-amber-100">
          <p>{error || "Google Drive preview is using its own controls."}</p>
          <p className="mt-1 text-gray-400">Use a shared MP4/WebM file or YouTube for synchronized Watch Together controls.</p>
          {room.isHost && onPrepareDriveMedia && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onPrepareDriveMedia({ forceTranscode: true })}
                disabled={preparingDriveMedia}
                className="h-9 px-3 inline-flex items-center gap-2 border border-amber-200/40 hover:border-primary hover:bg-primary/10 disabled:opacity-60 transition rounded-lg text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
              >
                {preparingDriveMedia ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <VideoIcon className="w-3.5 h-3.5" />}
                {preparingDriveMedia ? "Preparing synced video" : "Make synchronized copy"}
              </button>
              {preparingDriveMedia && <span className="text-gray-400">{drivePreparationStatus}</span>}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-white/10 space-y-3">
          {error && <p className="text-xs text-amber-200">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => seek(getCurrentTime() - 10)}
              disabled={!canControl}
              title="Back 10 seconds"
              aria-label="Back 10 seconds"
              className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 disabled:opacity-40 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              <Rewind className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!canControl}
              title={playback.isPlaying ? "Pause for everyone" : "Play for everyone"}
              aria-label={playback.isPlaying ? "Pause for everyone" : "Play for everyone"}
              className="w-10 h-9 flex items-center justify-center bg-primary hover:bg-primary-dull disabled:opacity-40 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              {playback.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => seek(getCurrentTime() + 10)}
              disabled={!canControl}
              title="Forward 10 seconds"
              aria-label="Forward 10 seconds"
              className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 disabled:opacity-40 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              <FastForward className="w-4 h-4" />
            </button>
            <span className="ml-auto text-xs tabular-nums text-gray-400">{formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="0.1"
            value={Math.min(currentTime, Math.max(duration, 1))}
            onPointerDown={() => { scrubbingRef.current = true; }}
            onPointerUp={finishScrubbing}
            onPointerCancel={finishScrubbing}
            onKeyDown={() => { scrubbingRef.current = true; }}
            onKeyUp={finishScrubbing}
            onChange={(event) => {
              previewSeek(event.target.value);
              if (!scrubbingRef.current) seek(event.target.value);
            }}
            disabled={!canControl}
            aria-label="Playback position"
            className="w-full accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-gray-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Local volume"
              className="w-24 accent-primary cursor-pointer"
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Toggle fullscreen"
              aria-label="Toggle fullscreen"
              className="ml-auto w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 transition rounded-lg cursor-pointer"
            >
              <Expand className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default MediaStage;
