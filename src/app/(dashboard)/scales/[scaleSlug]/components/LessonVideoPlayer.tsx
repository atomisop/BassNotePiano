"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Native <video> + a custom control bar built to the reference LMS's
 * layout: play/pause, volume, ±15s seek, running title/subtitle, elapsed/
 * total time, fullscreen. No captions/settings buttons — this build has no
 * way to attach real caption tracks, and a button with no function behind
 * it is worse than no button (per the brief).
 */
export function LessonVideoPlayer({
  src,
  title,
  subtitle,
  onEnded,
}: {
  src: string;
  title: string;
  subtitle: string;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // iOS Safari's native-video fullscreen path (see toggleFullscreen below)
  // fires its own pair of events on the <video> element instead of the
  // standard `fullscreenchange` on `document` handled above — without this,
  // the button's icon would get stuck on whatever it last showed once an
  // iPhone/iPad visitor actually uses that path.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleBegin = () => setFullscreen(true);
    const handleEnd = () => setFullscreen(false);
    video.addEventListener("webkitbeginfullscreen", handleBegin);
    video.addEventListener("webkitendfullscreen", handleEnd);
    return () => {
      video.removeEventListener("webkitbeginfullscreen", handleBegin);
      video.removeEventListener("webkitendfullscreen", handleEnd);
    };
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function seek(deltaSeconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(video.currentTime + deltaSeconds, 0), video.duration || 0);
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const time = Number(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const value = Number(e.target.value);
    video.volume = value;
    video.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  /**
   * iOS Safari only ever reliably supports fullscreen for actual video
   * playback through the <video> element's own native chrome
   * (`webkitEnterFullscreen`) — a WebKit extension that exists on iPhone/
   * iPad specifically and not on desktop Safari, so feature-detecting it is
   * a safe way to single out iOS without a user-agent sniff (the same check
   * video.js/Plyr/hls.js use for this exact case).
   *
   * The standard `Element.requestFullscreen()` on this wrapping container —
   * what used to run unconditionally here — is what iOS was actually
   * getting, and iOS has a long-standing WebKit bug where the page's zoom/
   * scroll state doesn't reliably restore once that kind of fullscreen
   * exits: reported live as the dock and top bar going missing after
   * finishing a lesson video, recoverable only by manually pinching to zoom
   * back out. Native video fullscreen hands the screen to iOS's own player
   * chrome instead (so the custom ±15s/volume bar is swapped for Apple's
   * own controls while fullscreen, same as every other iOS video app), but
   * it's the one path iOS actually restores the page correctly from on exit.
   */
  function toggleFullscreen() {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const iosVideo = video as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    };
    if (typeof iosVideo.webkitEnterFullscreen === "function") {
      if (iosVideo.webkitDisplayingFullscreen) {
        iosVideo.webkitExitFullscreen?.();
      } else {
        iosVideo.webkitEnterFullscreen();
      }
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }

  return (
    <div ref={containerRef} className="overflow-hidden rounded-2xl bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          src={src}
          // Without this, iOS Safari's default behavior is to hijack `play()`
          // into its own native fullscreen player regardless of which control
          // triggered it — so a lesson would jump to full-screen the instant
          // playback started, on every phone, never showing this custom
          // control bar (±15s, volume, the reference-LMS layout) at all.
          // `playsInline` (React's prop, renders the `playsinline` attribute)
          // is what keeps playback inline like every other browser already
          // does, leaving fullscreen an explicit choice via the button below.
          playsInline
          className="aspect-video w-full bg-black"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            onEnded();
          }}
          onClick={togglePlay}
        />

        {/* Title/subtitle overlay, top-left, fades with the rest of the chrome — cursor-not-allowed guards nothing here since it's decorative text, not a control. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4">
          <p className="font-serif text-sm text-slate-50">{title}</p>
          <p className="text-xs text-slate-300">{subtitle}</p>
        </div>
      </div>

      {/* Control bar */}
      <div className="space-y-2 bg-slate-950 px-4 py-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleScrub}
          aria-label="Seek"
          className="h-1.5 w-full cursor-pointer accent-[rgb(var(--c-s-50))]"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="cta-sheen cta-fill flex h-8 w-8 items-center justify-center rounded-full"
            >
              {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={() => seek(-15)}
              aria-label="Back 15 seconds"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => seek(15)}
              aria-label="Forward 15 seconds"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100"
            >
              <RotateCw size={16} />
            </button>
            <span className="ml-1 text-xs text-slate-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100"
              >
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="h-1 w-16 cursor-pointer accent-[rgb(var(--c-s-50))]"
              />
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100"
            >
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
