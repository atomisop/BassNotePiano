"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildGlassMaps, type GlassMaps } from "@/lib/liquidGlassMaps";

/**
 * A real pane of Liquid Glass behind its parent: the page behind it is refracted through a curved edge (a displacement map worked out
 * from Snell's law, see lib/liquidGlassMaps.ts), softly blurred and brightened, and a thin specular rim catches the light. Fill the parent
 * with it (the parent must be `relative`); put content above it. Browsers that cannot refract the backdrop (Safari, Firefox) get the same
 * glass without the bending: blur, tint and the glowing rim.
 */

function refractionSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)));
}

export function GlassLens({
  radius,
  bezel = 14,
  strength = 16,
  tint = "linear-gradient(180deg, rgb(255 255 255 / 0.14), rgb(255 255 255 / 0.04))",
  blur = 1.5,
  className = "",
}: {
  /** Corner radius in px, or "full" for a pill. */
  radius: number | "full";
  /** Width of the curved edge, in px. */
  bezel?: number;
  /** The largest shift of the page behind the edge, in px. */
  strength?: number;
  /** The glass body's own color, a CSS background. */
  tint?: string;
  /** Blur of what is behind the middle of the glass, px (small: glass is clear). */
  blur?: number;
  className?: string;
}) {
  const id = `lg-${useId().replace(/:/g, "")}`;
  const host = useRef<HTMLDivElement>(null);
  const [maps, setMaps] = useState<GlassMaps | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [refract, setRefract] = useState(false);

  useEffect(() => setRefract(refractionSupported()), []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const w = Math.round(el.offsetWidth || r.width);
      const h = Math.round(el.offsetHeight || r.height);
      if (w > 1 && h > 1) setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const r = size ? (radius === "full" ? Math.min(size.w, size.h) / 2 : Math.min(radius, Math.min(size.w, size.h) / 2)) : 0;
  const bz = size ? Math.min(bezel, Math.min(size.w, size.h) / 2 - 1) : bezel;

  useEffect(() => {
    if (!size) return;
    setMaps(buildGlassMaps({ width: size.w, height: size.h, radius: r, bezel: bz, strength }));
  }, [size, r, bz, strength]);

  const body = refract && maps ? `url(#${id}) blur(${blur}px) saturate(1.7) brightness(1.1)` : "blur(14px) saturate(1.8) brightness(1.08)";

  return (
    <div ref={host} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={{ borderRadius: r || undefined }}>
      {refract && maps && size && (
        <svg width={size.w} height={size.h} className="absolute left-0 top-0" style={{ pointerEvents: "none" }} colorInterpolationFilters="sRGB">
          <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={0} y={0} width={size.w} height={size.h} colorInterpolationFilters="sRGB">
            <feImage href={maps.displacement} x={0} y={0} width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={maps.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <div className="absolute inset-0" style={{ borderRadius: r || undefined, background: tint, WebkitBackdropFilter: body, backdropFilter: body }} />
      {maps && (
        <div
          className="absolute inset-0"
          style={{ borderRadius: r || undefined, backgroundImage: `url(${maps.specular})`, backgroundSize: "100% 100%", mixBlendMode: "screen", opacity: 0.95 }}
        />
      )}
    </div>
  );
}
