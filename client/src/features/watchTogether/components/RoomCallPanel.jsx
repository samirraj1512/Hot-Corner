import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, VideoIcon } from "lucide-react";

const StreamVideo = ({
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
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black border border-white/10">
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
      <span className="absolute left-2 bottom-2 max-w-[calc(100%-1rem)] truncate bg-black/65 px-2 py-1 text-xs rounded">{label}</span>
    </div>
  );
};

const RemoteAudio = ({ stream }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const playAudio = () => audio.play().catch(() => undefined);
    audio.muted = false;
    audio.srcObject = stream || null;
    if (stream) playAudio();
    window.addEventListener("pointerdown", playAudio, { passive: true });
    window.addEventListener("keydown", playAudio);
    return () => {
      window.removeEventListener("pointerdown", playAudio);
      window.removeEventListener("keydown", playAudio);
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
};

const RoomCallPanel = ({ callActive, call }) => {
  const [joining, setJoining] = useState(false);

  const joinCall = async () => {
    setJoining(true);
    try {
      await call.joinCall();
    } catch {
      // The hook displays the actionable call error beneath the controls.
    } finally {
      setJoining(false);
    }
  };

  return (
    <section className="border border-white/10 bg-white/[0.025] rounded-lg overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/10">
        <span className="flex items-center gap-2 text-sm font-medium"><VideoIcon className="w-4 h-4 text-primary" /> Room call</span>
        {callActive && !call.inCall && <span className="text-xs text-primary">Live</span>}
      </div>
      <div className="p-3 space-y-3">
        {call.inCall ? (
          <>
            {call.remoteStreams.map((remote) => <RemoteAudio key={`audio-${remote.socketId}`} stream={remote.stream} />)}
            <div className="grid grid-cols-2 gap-2">
              <StreamVideo stream={call.localStream} label="You" videoEnabled={call.videoEnabled} />
              {call.remoteStreams.map((remote) => (
                <StreamVideo
                  key={remote.socketId}
                  stream={remote.stream}
                  label={remote.participant?.name || "Guest"}
                  socketId={remote.socketId}
                  onPlaybackStart={call.markRemoteVideoPlaying}
                  onPlaybackStalled={call.reportRemoteVideoStalled}
                />
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={call.toggleAudio}
                title={call.audioEnabled ? "Mute microphone" : "Turn microphone on"}
                aria-label={call.audioEnabled ? "Mute microphone" : "Turn microphone on"}
                className="w-10 h-10 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 transition rounded-lg cursor-pointer"
              >
                {call.audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={call.toggleVideo}
                title={call.videoEnabled ? "Turn camera off" : "Turn camera on"}
                aria-label={call.videoEnabled ? "Turn camera off" : "Turn camera on"}
                className="w-10 h-10 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 transition rounded-lg cursor-pointer"
              >
                {call.videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={call.leaveCall}
                title="Leave room call"
                aria-label="Leave room call"
                className="w-10 h-10 flex items-center justify-center bg-primary hover:bg-primary-dull transition rounded-lg cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={joinCall}
            disabled={joining}
            className="w-full h-11 flex items-center justify-center gap-2 border border-white/15 hover:border-primary hover:bg-primary/10 disabled:opacity-60 transition rounded-lg text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
          >
            <Phone className="w-4 h-4 text-primary" />
            {joining ? "Joining call" : callActive ? "Join call" : "Start call"}
          </button>
        )}
        {call.error && <p className="text-xs text-red-300">{call.error}</p>}
      </div>
    </section>
  );
};

export default RoomCallPanel;
