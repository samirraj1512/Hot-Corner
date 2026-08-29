import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Move, VideoOff } from "lucide-react";

const EDGE_GAP = 12;
const MIN_WIDTH = 176;
const MIN_HEIGHT = 104;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const CallVideo = ({
  stream,
  label,
  videoEnabled = true,
  socketId,
  onPlaybackStart,
  onPlaybackStalled,
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const playVideo = () => video.play().catch(() => undefined);
    video.muted = true;
    video.srcObject = stream || null;
    if (stream) playVideo();

    const videoTracks = stream?.getVideoTracks?.() || [];
    videoTracks.forEach((track) => track.addEventListener("unmute", playVideo));
    return () => {
      videoTracks.forEach((track) => track.removeEventListener("unmute", playVideo));
      video.pause();
      video.srcObject = null;
    };
  }, [stream, videoEnabled]);

  return (
    <div className="relative min-h-0 overflow-hidden bg-black">
      {stream && videoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(event) => event.currentTarget.play().catch(() => undefined)}
          onCanPlay={(event) => event.currentTarget.play().catch(() => undefined)}
          onPlaying={() => onPlaybackStart?.(socketId)}
          onWaiting={() => onPlaybackStalled?.(socketId)}
          onStalled={() => onPlaybackStalled?.(socketId)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500"><VideoOff className="w-5 h-5" /></div>
      )}
      <span className="absolute left-1.5 bottom-1.5 max-w-[calc(100%-0.75rem)] truncate bg-black/70 px-1.5 py-0.5 text-[10px] rounded">{label}</span>
    </div>
  );
};

const FloatingCallOverlay = ({ call, containerRef }) => {
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [size, setSize] = useState({ width: 264, height: 158 });

  const getBounds = useCallback(() => containerRef.current?.getBoundingClientRect(), [containerRef]);
  const clampSize = useCallback((nextSize, bounds) => ({
    width: clamp(nextSize.width, MIN_WIDTH, Math.max(MIN_WIDTH, bounds.width - EDGE_GAP * 2)),
    height: clamp(nextSize.height, MIN_HEIGHT, Math.max(MIN_HEIGHT, bounds.height - EDGE_GAP * 2)),
  }), []);
  const defaultPosition = useCallback((bounds, nextSize = size) => ({
    x: Math.max(EDGE_GAP, bounds.width - nextSize.width - EDGE_GAP),
    y: EDGE_GAP,
  }), [size]);
  const clampPosition = useCallback((nextPosition, nextSize, bounds) => ({
    x: clamp(nextPosition.x, EDGE_GAP, Math.max(EDGE_GAP, bounds.width - nextSize.width - EDGE_GAP)),
    y: clamp(nextPosition.y, EDGE_GAP, Math.max(EDGE_GAP, bounds.height - nextSize.height - EDGE_GAP)),
  }), []);

  useEffect(() => {
    const bounds = getBounds();
    if (bounds && !position) setPosition(defaultPosition(bounds));
  }, [defaultPosition, getBounds, position]);

  const handleDragStart = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const bounds = getBounds();
    if (!bounds) return;
    const startPosition = position || defaultPosition(bounds);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      position: startPosition,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event) => {
    const drag = dragRef.current;
    const bounds = getBounds();
    if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
    setPosition(clampPosition({
      x: drag.position.x + event.clientX - drag.startX,
      y: drag.position.y + event.clientY - drag.startY,
    }, size, bounds));
  };

  const stopDragging = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleResizeStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = getBounds();
    if (!bounds) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      size,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event) => {
    const resize = resizeRef.current;
    const bounds = getBounds();
    if (!resize || resize.pointerId !== event.pointerId || !bounds) return;
    const nextSize = clampSize({
      width: resize.size.width + event.clientX - resize.startX,
      height: resize.size.height + event.clientY - resize.startY,
    }, bounds);
    setSize(nextSize);
    setPosition((current) => clampPosition(current || defaultPosition(bounds, nextSize), nextSize, bounds));
  };

  const stopResizing = (event) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const toggleSize = () => {
    const bounds = getBounds();
    if (!bounds) return;
    const nextSize = clampSize(
      size.width > 264 ? { width: 264, height: 158 } : { width: 360, height: 220 },
      bounds,
    );
    setSize(nextSize);
    setPosition((current) => clampPosition(current || defaultPosition(bounds, nextSize), nextSize, bounds));
  };

  const streams = [
    { id: "local", stream: call.localStream, label: "You", videoEnabled: call.videoEnabled },
    ...call.remoteStreams.map((remote) => ({
      id: remote.socketId,
      stream: remote.stream,
      label: remote.participant?.name || "Guest",
      socketId: remote.socketId,
      onPlaybackStart: call.markRemoteVideoPlaying,
      onPlaybackStalled: call.reportRemoteVideoStalled,
    })),
  ];
  const displayPosition = position || { x: EDGE_GAP, y: EDGE_GAP };

  return (
    <section
      role="dialog"
      aria-label="Floating room call"
      className="absolute z-30 overflow-hidden border border-white/20 bg-[#0b0b0e]/95 shadow-2xl rounded-lg"
      style={{ left: displayPosition.x, top: displayPosition.y, width: size.width, height: size.height }}
    >
      <div
        className="h-7 px-2 flex items-center justify-between bg-black/75 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <span className="flex items-center gap-1.5 text-[10px] text-gray-200"><Move className="w-3 h-3" /> Room call</span>
        <button
          type="button"
          onClick={toggleSize}
          title="Toggle call size"
          aria-label="Toggle call size"
          className="w-5 h-5 flex items-center justify-center hover:text-primary transition cursor-pointer"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
      <div className={`grid h-[calc(100%-1.75rem)] ${streams.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {streams.map((stream) => <CallVideo key={stream.id} {...stream} />)}
      </div>
      <div
        role="presentation"
        aria-label="Resize call window"
        className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize touch-none before:absolute before:right-1 before:bottom-1 before:w-2 before:h-2 before:border-r before:border-b before:border-white/70"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={stopResizing}
        onPointerCancel={stopResizing}
      />
    </section>
  );
};

export default FloatingCallOverlay;
