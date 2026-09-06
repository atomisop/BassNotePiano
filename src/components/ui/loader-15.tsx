"use client";

import * as React from "react";

/**
 * Loader-15 — a cool-grey animated gradient ring, sourced from a 21st.dev
 * community component of the same name (whose original was pink→orange).
 * Recolored to a neutral light-grey→white sweep, matching the app's own
 * cool-grey monochrome system (see themes.css's own "Accent" comment) —
 * Atom used to run its own distinct teal→blue identity, deliberately
 * different from the house look; reverted by direct instruction in favor
 * of Atom actually matching the rest of the app now (see
 * AssistantWidget.tsx's own top comment).
 *
 * Ported from the original's `styled-components` to `<style jsx>` —
 * Next.js's own built-in scoped-CSS mechanism — instead of pulling a whole
 * new CSS-in-JS runtime into an otherwise Tailwind-first codebase for one
 * decorative component. The visual output (the gooey blur via
 * `feGaussianBlur`/`feColorMatrix`, the two out-of-phase dash-offset
 * sweeps) is unchanged from the source; only the styling mechanism moved,
 * and the gradient/filter ids are now generated per-instance (`useId`)
 * instead of the original's hardcoded strings, so two `<Loader />`s
 * mounted at once don't collide.
 *
 * The source component's second copy of the ring (a blurred "shadow" pass,
 * offset a few px and rendered at low opacity) is deliberately dropped
 * here: with no positioned ancestor to pin it against, it kept its own
 * static-flow position instead of stacking on the real ring, so in every
 * place this app actually uses Loader (a small fixed-size circle — Atom's
 * launcher button, its chat-panel header icon) it rendered as a separate
 * blurry blob floating below the icon rather than a shadow behind it —
 * exactly the "reflection" a visitor on the live site reported seeing
 * under Atom's launcher. Removing the copy entirely (rather than pinning
 * it with `inset: 0` to force it into a tight drop-shadow) is the version
 * confirmed to actually look right here.
 *
 * `size` scales the whole thing — the path data, stroke widths and blur
 * radius are all defined in the same 200×200 `viewBox`, so they scale
 * together rather than the blur going muddy at small sizes. That said,
 * this is still the *decorative* build (60–200px: Atom's launcher and
 * chat-panel icon). For inline/button-sized loading state — form submits,
 * file uploads, any small "this is working" indicator — use `SpinnerIcon`
 * from `components/ui/icons.tsx` instead: a plain `currentColor` spinner,
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

      <style jsx>{`
        .gegga {
          /* Exists only to hold the <filter> definition <snurra> references
             by url(#id), never meant to be seen or take up room. width: 0
             alone wasn't enough: an <svg> with no explicit height defaults
             to the browser's replaced-element fallback (150px), and that
             real height stacked above the visible icon in normal flow,
             overflowing well past the 32-60px circle everywhere Loader is
             used (confirmed live: Atom's launcher and its chat-panel
             header icon both spilled a blurred blob down past their own
             bounds). position: absolute pulls it out of flow entirely, and
             the explicit 0×0 plus overflow: hidden means even a browser
             that ignores one of those still can't render anything from it.
             Filter references to an off-flow, zero-size element still
             resolve correctly; only paint, not layout participation, is
             affected. */
          position: absolute;
          width: 0;
          height: 0;
          overflow: hidden;
        }
        .snurra {
          filter: url(#${filterId});
        }
        .stopp1 {
          stop-color: #b9bfca;
        }
        .stopp2 {
          stop-color: #eef1f8;
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
