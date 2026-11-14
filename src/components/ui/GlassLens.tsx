"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildFilterSvg, detectGlassMode, displacementBlobUrl, GLASS_BACKDROP, type GlassMode } from "@/lib/liquidGlassMaps";

/**
 * One pane of the app's liquid glass, behaving exactly like the source's `LiquidGlass` (21st.dev "Liquid Glass Login", see
 * reference/liquid-glass-login.tsx): a Snell's-law displacement map bends what is behind it through an SVG filter used as
 * `backdrop-filter`, with chromatic aberration and a faint frost. Chromium refracts; Safari and Firefox get the frosted look
 * (blur, white gradient, bright inset ring); reduced transparency and Solid surfaces get an opaque panel.
 *
 * It is a LAYER, not a wrapper: fill a `relative` parent with it and put the content beside it, above it. An element with a
 * backdrop-filter is a backdrop root, so glass nested inside glass would only see the outer glass's tint.
 */
export function GlassLens({
  radius,
  bezel = 22,
  strength = 36,
  aberration = 10,
  frost = 0.4,
  tint,
  surface = false,
  className = "",
}: {
  /** Corner radius in px, or "full" for a pill. */
  radius: number | "full";
  /** Width of the bending rim, px (the source's bevelDepth). */
  bezel?: number;
  /** Displacement strength, px (the source's scale). */
  strength?: number;
  /** Chromatic aberration spread, px. */
  aberration?: number;
  /** Extra blur after refraction, px. */
  frost?: number;
  /** The glass body's colour, a CSS colour. Defaults to the theme's floating glass tint. */
  tint?: string;
  /** Kept for older callers; the frost is the only blur now. */
  blur?: number;
  /** Kept for older callers; the face no longer magnifies (the source's map has no flat-face shift). */
  magnify?: number;
  /** True when this lens IS the panel's own background (a menu or sheet); false for a highlight, knob or bubble. Solid surfaces draws the first as an opaque panel and the second as a soft fill. */
  surface?: boolean;
  className?: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const host = useRef<HTMLDivElement>(null);
  const blob = useRef<string | null>(null);
  const [mode, setMode] = useState<GlassMode | "pending">("pending");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [filter, setFilter] = useState<{ id: string; svg: string } | null>(null);

  useEffect(() => setMode(detectGlassMode()), []);

  useEffect(() => {
    const el = host.current;
    if (!el || mode !== "refract") return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const w = Math.max(1, Math.round(box?.inlineSize ?? entry.contentRect.width));
      const h = Math.max(1, Math.round(box?.blockSize ?? entry.contentRect.height));
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const r = size ? (radius === "full" ? Math.min(size.w, size.h) / 2 : Math.min(radius, size.w / 2, size.h / 2)) : radius === "full" ? 9999 : radius;

  useEffect(() => {
    if (mode !== "refract" || !size || size.w <= 1 || size.h <= 1) return;
    let cancelled = false;
    (async () => {
      const mapUrl = await displacementBlobUrl({
        width: size.w,
        height: size.h,
        radius: Math.min(r, size.w / 2, size.h / 2),
        bevelDepth: Math.min(bezel, Math.min(size.w, size.h) / 2),
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (!mapUrl) return;
      // Decode the map before the filter attaches.
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = mapUrl;
      });
      if (cancelled) {
        URL.revokeObjectURL(mapUrl);
        return;
      }
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = mapUrl;
      // A fresh id each rebuild, because browsers cache filter output by id.
      const id = `lg-${reactId}-${size.w}x${size.h}-${Date.now().toString(36)}`;
      setFilter({ id, svg: buildFilterSvg({ id, mapUrl, width: size.w, height: size.h, scale: strength, aberration, frost }) });
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, size, r, bezel, strength, aberration, frost, reactId]);

  useEffect(
    () => () => {
      if (blob.current) URL.revokeObjectURL(blob.current);
    },
    [],
  );

  const backdrop =
    mode === "opaque" ? "none" : mode === "simple" ? GLASS_BACKDROP.simple : filter ? `url(#${filter.id}) ${GLASS_BACKDROP.refract}` : GLASS_BACKDROP.loading;
  const rounded = typeof r === "number" && r > 0 ? r : undefined;

  return (
    <div
      ref={host}
      aria-hidden
      data-glass-lens={surface ? "surface" : "highlight"}
      data-glass-mode={mode}
      className={`lgx-lens pointer-events-none absolute inset-0 ${className}`}
      style={{ borderRadius: rounded }}
    >
      {filter ? <span key={filter.id} aria-hidden className="pointer-events-none absolute size-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: filter.svg }} /> : null}
      <div
        className="lgx-lens-body absolute inset-0"
        style={{
          borderRadius: rounded,
          // With an SVG filter in it, Chrome stops rounding the backdrop to the border radius, so the clip-path keeps the glass its shape.
          clipPath: rounded ? `inset(0 round ${rounded}px)` : undefined,
          backgroundColor: tint ?? "var(--lgx-tint-floating)",
          WebkitBackdropFilter: backdrop,
          backdropFilter: backdrop,
        }}
      />
    </div>
  );
}
