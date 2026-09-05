"use client";

import { useEffect, useRef, useState } from "react";

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

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }

  return (
    <div ref={containerRef} className="overflow-hidden rounded-2xl bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          src={src}
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
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => seek(-15)}
              aria-label="Back 15 seconds"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => seek(15)}
              aria-label="Forward 15 seconds"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
                {muted || volume === 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5 6 9H2v6h4l5 4V5Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M23 9 17 15M17 9l6 6" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 5 6 9H2v6h4l5 4V5Z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />
                  </svg>
                )}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
