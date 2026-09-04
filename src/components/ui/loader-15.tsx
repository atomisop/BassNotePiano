"use client";

import * as React from "react";

/**
 * Loader-15 — a pink→orange animated gradient ring, sourced from a
 * 21st.dev community component of the same name.
 *
 * Ported from the original's `styled-components` to `<style jsx>` —
 * Next.js's own built-in scoped-CSS mechanism — instead of pulling a whole
 * new CSS-in-JS runtime into an otherwise Tailwind-first codebase for one
 * decorative component. The visual output (the gooey blur via
 * `feGaussianBlur`/`feColorMatrix`, the two out-of-phase dash-offset
 * sweeps, the soft offset shadow copy) is unchanged from the source;
 * only the styling mechanism moved, and the gradient/filter ids are now
 * generated per-instance (`useId`) instead of the original's hardcoded
 * strings, so two `<Loader />`s mounted at once don't collide.
 *
 * `size` scales the whole thing — the path data, stroke widths and blur
 * radius are all defined in the same 200×200 `viewBox`, so they scale
 * together rather than the blur going muddy at small sizes. That said,
 * this is still the *decorative* build (60–200px: Atom's launcher and
 * chat-panel icon). For inline/button-sized loading state — form submits,
 * file uploads, any small "this is working" indicator — use `SpinnerIcon`
 * from `components/ui/icons.tsx` instead: the same pink→orange gradient,
 * unblurred and legible down to ~12px, and already wired through
 * `Button`'s own `loading` prop everywhere that's used.
 */
export default function Loader({ size = 200, className }: { size?: number; className?: string }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const filterId = `loader15-gegga-${uid}`;
  const stopsId = `loader15-stops-${uid}`;
  const gradientId = `loader15-gradient-${uid}`;

  return (
    <div className={className} aria-hidden style={{ display: "inline-block" }}>
      <svg className="gegga">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={7} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -10" result="inreGegga" />
            <feComposite in="SourceGraphic" in2="inreGegga" operator="atop" />
          </filter>
        </defs>
      </svg>
      <svg className="snurra" width={size} height={size} viewBox="0 0 200 200">
        <defs>
          <linearGradient id={stopsId}>
            <stop className="stopp1" offset={0} />
            <stop className="stopp2" offset={1} />
          </linearGradient>
          <linearGradient y2={160} x2={160} y1={40} x1={40} gradientUnits="userSpaceOnUse" id={gradientId} xlinkHref={`#${stopsId}`} />
        </defs>
        <path
          className="halvan"
          style={{ stroke: `url(#${gradientId})` }}
          d="m 164,100 c 0,-35.346224 -28.65378,-64 -64,-64 -35.346224,0 -64,28.653776 -64,64 0,35.34622 28.653776,64 64,64 35.34622,0 64,-26.21502 64,-64 0,-37.784981 -26.92058,-64 -64,-64 -37.079421,0 -65.267479,26.922736 -64,64 1.267479,37.07726 26.703171,65.05317 64,64 37.29683,-1.05317 64,-64 64,-64"
        />
        <circle className="strecken" style={{ stroke: `url(#${gradientId})` }} cx={100} cy={100} r={64} />
      </svg>
      <svg className="skugga" width={size} height={size} viewBox="0 0 200 200">
        <path
          className="halvan"
          style={{ stroke: `url(#${gradientId})` }}
          d="m 164,100 c 0,-35.346224 -28.65378,-64 -64,-64 -35.346224,0 -64,28.653776 -64,64 0,35.34622 28.653776,64 64,64 35.34622,0 64,-26.21502 64,-64 0,-37.784981 -26.92058,-64 -64,-64 -37.079421,0 -65.267479,26.922736 -64,64 1.267479,37.07726 26.703171,65.05317 64,64 37.29683,-1.05317 64,-64 64,-64"
        />
        <circle className="strecken" style={{ stroke: `url(#${gradientId})` }} cx={100} cy={100} r={64} />
      </svg>

      <style jsx>{`
        .gegga {
          width: 0;
        }
        .snurra {
          filter: url(#${filterId});
        }
        .stopp1 {
          stop-color: #f700a8;
        }
        .stopp2 {
          stop-color: #ff8000;
        }
        .halvan {
          animation: loader15-snurra 10s infinite linear;
          stroke-dasharray: 180 800;
          fill: none;
          stroke-width: 23;
          stroke-linecap: round;
        }
        .strecken {
          animation: loader15-snurra 3s infinite linear;
          stroke-dasharray: 26 54;
          fill: none;
          stroke-width: 23;
          stroke-linecap: round;
        }
        .skugga {
          /* No top/left and no positioned ancestor, matching the original
             exactly — an absolutely-positioned box with no inset set
             keeps its static-flow position, which is what actually
             produces the stacked (not overlapping) pair the source
             component's own preview shows. Pinning it to inset 0 here
             would "fix" it into a tight drop-shadow, which looks
             different from the design that was actually picked. */
          filter: blur(5px);
          opacity: 0.3;
          position: absolute;
          transform: translate(3px, 3px);
        }
        @keyframes loader15-snurra {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -403px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .halvan,
          .strecken {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
