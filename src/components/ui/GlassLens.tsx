"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildGlassMaps, type GlassMaps } from "@/lib/liquidGlassMaps";

/**
 * A real pane of Liquid Glass behind its parent: the page behind it is refracted through a curved edge (a displacement map worked out
 * from Snell's law, see lib/liquidGlassMaps.ts), softly blurred and brightened, and a thin specular rim catches the light. Fill the parent
 * with it (the parent must be `relative`); put content above it. Browsers that cannot refract the backdrop (Safari, Firefox) get the same
 * glass without the bending: blur, tint and the glowing rim.
 */

const disperse = (amount: number) => Math.max(0, Math.min(3, amount));

function refractionSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)));
}

export function GlassLens({
  radius,
  bezel = 14,
  strength = 16,
  magnify = 0.4,
  tint = "transparent",
  blur = 1.5,
  className = "",
}: {
  /** Corner radius in px, or "full" for a pill. */
  radius: number | "full";
  /** Width of the curved edge, in px. */
  bezel?: number;
  /** The largest shift of the page behind the edge, in px. */
  strength?: number;
  /** How much the whole face magnifies what is behind it (0 to 1). */
  magnify?: number;
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

  const [tokens, setTokens] = useState({ refraction: 1, dispersion: 1, blur: 1.5 });
  const light = useRef<SVGFEDistantLightElement>(null);

  // The light comes from wherever the pointer (or finger) is, so the rim lights up on the side facing it and follows as it moves.
  useEffect(() => {
    if (!refract) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const aim = () => {
      frame = 0;
      const el = host.current;
      const l = light.current;
      if (!el || !l || !last) return;
      const r = el.getBoundingClientRect();
      const angle = (Math.atan2(last.clientY - (r.top + r.height / 2), last.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
      l.setAttribute("azimuth", String(Math.round(angle)));
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(aim);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [refract]);
  useEffect(() => {
    setRefract(refractionSupported());
    // The look is set in one place (the --lg-* variables in globals.css, and "reduce transparency" switches the bending off).
    const style = getComputedStyle(document.documentElement);
    const num = (name: string, fallback: number) => {
      const v = parseFloat(style.getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    const reduced = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
    setTokens({ refraction: reduced ? 0 : num("--lg-refraction", 1), dispersion: reduced ? 0 : num("--lg-dispersion", 1), blur: num("--lg-blur", 1.5) });
  }, []);

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
    setMaps(buildGlassMaps({ width: size.w, height: size.h, radius: r, bezel: bz, strength: strength * tokens.refraction, magnify }));
  }, [size, r, bz, strength, magnify, tokens.refraction]);

  const body = refract && maps && tokens.refraction > 0 ? `url(#${id}) blur(${blur * (tokens.blur / 1.5)}px) saturate(1.7) brightness(1.1)` : "blur(14px) saturate(1.8) brightness(1.08)";
  const split = disperse(tokens.dispersion);

  return (
    <div ref={host} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={{ borderRadius: r || undefined }}>
      {refract && maps && size && (
        <svg width={size.w} height={size.h} className="absolute left-0 top-0" style={{ pointerEvents: "none" }} colorInterpolationFilters="sRGB">
          <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={0} y={0} width={size.w} height={size.h} colorInterpolationFilters="sRGB">
            <feImage href={maps.displacement} x={0} y={0} width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            {/* Each color is bent by a slightly different amount, so the edge splits into a faint rainbow (dispersion), like real glass. */}
            <feDisplacementMap in="SourceGraphic" in2="map" scale={maps.scale} xChannelSelector="R" yChannelSelector="G" result="dr" />
            <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={maps.scale * (1 + 0.035 * split)} xChannelSelector="R" yChannelSelector="G" result="dg" />
            <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={maps.scale * (1 + 0.075 * split)} xChannelSelector="R" yChannelSelector="G" result="db" />
            <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feBlend in="r" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="b" mode="screen" result="refracted" />
            {/* Real light on the curved glass: a specular pass over the surface's own height, lit from the pointer's side. */}
            <feImage href={maps.height} x={0} y={0} width={size.w} height={size.h} preserveAspectRatio="none" result="surface" />
            <feSpecularLighting in="surface" surfaceScale={Math.max(2, bz * 0.45)} specularConstant={0.85} specularExponent={26} lightingColor="#ffffff" result="glint">
              <feDistantLight ref={light} azimuth={225} elevation={32} />
            </feSpecularLighting>
            <feComposite in="glint" in2="surface" operator="in" result="glintOnGlass" />
            <feBlend in="glintOnGlass" in2="refracted" mode="screen" />
          </filter>
        </svg>
      )}
      <div
        className="absolute inset-0"
        // With an SVG filter in it, Chrome stops rounding the backdrop to the border radius, so the clip-path keeps the glass its shape.
        style={{ borderRadius: r || undefined, clipPath: r ? `inset(0 round ${r}px)` : undefined, background: tint, WebkitBackdropFilter: body, backdropFilter: body }}
      />
      {maps && !(refract && tokens.refraction > 0) && (
        <div
          className="absolute inset-0"
          style={{ borderRadius: r || undefined, backgroundImage: `url(${maps.specular})`, backgroundSize: "100% 100%", opacity: 0.95 }}
        />
      )}
    </div>
  );
}
