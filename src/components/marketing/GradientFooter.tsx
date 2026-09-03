"use client";

// A footer whose content reads first; a blurred rainbow glow is pinned to
// the bottom of the viewport and rises up from the floor over the last
// stretch of scroll, reaching full height exactly at the end of the page.
// One inline <svg> — no canvas, no scroll-jacking, no external deps (this
// project doesn't use shadcn/radix, so this is a from-scratch, self-
// contained port of the visual technique rather than a drop-in copy).
//
// Gradient design inspired by Dia Browser — https://www.diabrowser.com

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Stop = { offset: number; color: string };

const VBW = 1271;
const VBH = 599;

// Same technique as the original Dia Browser effect this was ported from:
// a soft band rising from the floor, retuned to the app's own black/amber
// identity: a deep amber-brown floor brightening to the vivid accent
// partway up, then dissolving through pale cream into transparency near
// the top.
const DEFAULT_STOPS: Stop[] = [
  { offset: 0, color: "#2E1F0D" },
  { offset: 0.22, color: "#5C3D14" },
  { offset: 0.42, color: "#B87A2E" },
  { offset: 0.62, color: "#E8AC7A" },
  { offset: 0.82, color: "#F7DCC5" },
  { offset: 1, color: "#F5F5F500" },
];

function bellHeights(n: number, peak: number, valley: number): number[] {
  const out: number[] = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;
    const eased = 1 - Math.pow(t, 1.24);
    out.push(peak * VBH * (valley + (1 - valley) * eased));
  }
  return out;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface GradientFooterProps {
  children?: ReactNode;
  gradientHeight?: string;
  minReveal?: number;
  bars?: number;
  blur?: number;
  peak?: number;
  valley?: number;
  stops?: Stop[];
  className?: string;
  style?: CSSProperties;
}

export function GradientFooter({
  children,
  gradientHeight = "40vh",
  minReveal = 0.05,
  bars = 9,
  blur = 15,
  peak = 0.98,
  valley = 0.55,
  stops = DEFAULT_STOPS,
  className,
  style,
}: GradientFooterProps) {
  const uid = useId().replace(/:/g, "");
  const bandRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(minReveal);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    // A static, fully-risen glow is a reasonable resting state for anyone
    // who'd rather not have scroll-linked motion.
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    const el = bandRef.current;
    if (!el) return;
    const doc = el.ownerDocument;
    const win = doc.defaultView ?? window;
    const measure = () => {
      const h = el.offsetHeight || 1;
      const left = doc.documentElement.scrollHeight - win.innerHeight - win.scrollY;
      const t = clamp01((h - left) / h);
      setProgress(minReveal + (1 - minReveal) * t);
    };
    measure();
    win.addEventListener("scroll", measure, { passive: true });
    win.addEventListener("resize", measure, { passive: true });
    return () => {
      win.removeEventListener("scroll", measure);
      win.removeEventListener("resize", measure);
    };
  }, [minReveal, reducedMotion]);

  const colW = VBW / bars;

  return (
    <footer className={className} style={{ paddingBottom: gradientHeight, ...style }}>
      {children}

      <div
        ref={bandRef}
        aria-hidden
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: gradientHeight,
          pointerEvents: "none",
          transformOrigin: "bottom",
          transform: `scaleY(${progress})`,
          willChange: "transform",
        }}
      >
        <svg style={{ height: "100%", width: "100%", display: "block" }} viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" fill="none">
          <defs>
            <linearGradient id={`grad-${uid}`} x1="0" y1="1" x2="0" y2="0">
              {stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
            <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={blur} />
            </filter>
          </defs>
          {bellHeights(bars, peak, valley).map((barH, i) => (
            <g key={i} filter={`url(#blur-${uid})`}>
              <rect x={i * colW} y={VBH - barH} width={colW * 1.23} height={barH} fill={`url(#grad-${uid})`} />
            </g>
          ))}
        </svg>
      </div>
    </footer>
  );
}
