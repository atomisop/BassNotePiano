"use client";

import { useEffect } from "react";
import { buildGlassMaps, type GlassMaps } from "@/lib/liquidGlassMaps";

/**
 * Real Liquid Glass for every button in the app, from one place. It finds each glass control (the shared Button, tabs, the admin menu,
 * every small raised-style control) and gives it a lens: the page behind is refracted through a curved edge, split into a faint rainbow
 * where it bends, softly shaded inside the rim and lit from the side your pointer is on. Buttons of the same size share one lens, so a
 * page full of buttons builds only a handful. The lens itself is drawn by CSS (.lg-glass::after in globals.css), which reads the filter
 * this sets on the button. Only browsers that can refract the backdrop get it (Chrome, Edge); the rest keep the blur-and-rim glass.
 */

export const GLASS_SELECTOR = [
  ".liquid",
  ".liquid-signal",
  ".neu-btn",
  'button[class*="shadow-raised-low"]:not([class*="bg-signal"]):not([class*="bg-red"])',
  'a[class*="shadow-raised-low"][class*="rounded-full"]',
  'a[class*="shadow-raised-low"][class*="h-8"]',
  'a[class*="shadow-raised-low"][class*="h-9"]',
].join(", ");

const SKIP = "[data-glass], [data-glass] *, [data-no-lens], .hit-slop";
const MAX_FILTERS = 160;
const SVG_NS = "http://www.w3.org/2000/svg";

function refractionSupported(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)));
}

const el = (name: string, attrs: Record<string, string | number>, children: Element[] = []) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
};

/** One lens: refraction with a rainbow split, a soft inner shadow along the rim, and live specular light from the glass's own surface. */
export function glassFilter(id: string, maps: GlassMaps, w: number, h: number, bezel: number, dispersion: number): SVGFilterElement {
  const split = Math.max(0, Math.min(3, dispersion));
  const channel = (name: string, scale: number, matrix: string) => [
    el("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale, xChannelSelector: "R", yChannelSelector: "G", result: `d${name}` }),
    el("feColorMatrix", { in: `d${name}`, type: "matrix", values: matrix, result: name }),
  ];
  const light = el("feDistantLight", { azimuth: 225, elevation: 32 });
  return el(
    "filter",
    { id, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h, "color-interpolation-filters": "sRGB" },
    [
      el("feImage", { href: maps.displacement, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "map" }),
      ...channel("r", maps.scale, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"),
      ...channel("g", maps.scale * (1 + 0.035 * split), "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"),
      ...channel("b", maps.scale * (1 + 0.075 * split), "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"),
      el("feBlend", { in: "r", in2: "g", mode: "screen", result: "rg" }),
      el("feBlend", { in: "rg", in2: "b", mode: "screen", result: "refracted" }),
      el("feImage", { href: maps.height, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "surface" }),
      // Soft inner shadow: darker where the glass curves down to its edge.
      el("feColorMatrix", { in: "surface", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.24 0.24", result: "rimShadow" }),
      el("feComposite", { in: "rimShadow", in2: "refracted", operator: "over", result: "shaded" }),
      el("feSpecularLighting", { in: "surface", surfaceScale: Math.max(2, bezel * 0.45), specularConstant: 0.85, specularExponent: 26, "lighting-color": "#ffffff", result: "glint" }, [light]),
      el("feComposite", { in: "glint", in2: "surface", operator: "in", result: "glintOnGlass" }),
      el("feBlend", { in: "glintOnGlass", in2: "shaded", mode: "screen" }),
    ],
  ) as SVGFilterElement;
}

export function GlassButtons() {
  useEffect(() => {
    if (!refractionSupported() || window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return;
    const root = document.documentElement;
    const num = (name: string, fallback: number) => {
      const v = parseFloat(getComputedStyle(root).getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    const refraction = num("--lg-refraction", 1);
    const dispersion = num("--lg-dispersion", 1);
    if (refraction <= 0) return;

    const defs = el("svg", { width: 0, height: 0, "aria-hidden": "true" }) as SVGSVGElement;
    defs.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(defs);

    const made = new Map<string, string>();
    const keyOf = new WeakMap<HTMLElement, string>();

    // Lenses are built one at a time when the browser is idle, so loading a page full of buttons never stalls scrolling or taps.
    const pending = new Map<string, { w: number; h: number; r: number; nodes: Set<HTMLElement> }>();
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const idle = (cb: () => void) => (ric ? ric.call(window, cb, { timeout: 400 }) : window.setTimeout(cb, 30));
    let building = false;
    const buildNext = () => {
      const next = pending.entries().next();
      if (next.done) {
        building = false;
        return;
      }
      const [key, job] = next.value;
      pending.delete(key);
      if (made.size < MAX_FILTERS) {
        const bezel = Math.max(4, Math.min(14, Math.round(job.h * 0.34), Math.floor(Math.min(job.w, job.h) / 2) - 1));
        const maps = buildGlassMaps({ width: job.w, height: job.h, radius: job.r, bezel, strength: Math.max(4, Math.round(job.h * 0.3)) * refraction, magnify: 0.5 }, { specular: false });
        if (maps && maps.height) {
          const id = `lgf-${key}`;
          defs.appendChild(glassFilter(id, maps, job.w, job.h, bezel, dispersion));
          made.set(key, id);
          job.nodes.forEach((n) => wear(n, id, job.r));
        }
      }
      idle(buildNext);
    };
    const wear = (node: HTMLElement, id: string, r: number) => {
      if (keyOf.get(node) === id) return;
      keyOf.set(node, id);
      node.style.setProperty("--lg-filter", `url(#${id})`);
      node.style.setProperty("--lg-r", `${r}px`);
      node.classList.add("lg-glass");
    };

    const apply = (node: HTMLElement) => {
      // Widths share a lens in 8px steps (heights are exact: there are only a few), so similar buttons reuse one.
      const w = Math.round(node.offsetWidth / 8) * 8;
      const h = Math.round(node.offsetHeight);
      if (w < 16 || h < 16 || w > 720 || h > 160) return;
      const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
      const r = Math.min(Math.round(radius), Math.floor(h / 2));
      const key = `${w}x${h}r${r}`;
      const id = made.get(key);
      if (id) return wear(node, id, r);
      const job = pending.get(key) ?? { w, h, r, nodes: new Set<HTMLElement>() };
      job.nodes.add(node);
      pending.set(key, job);
      if (!building) {
        building = true;
        idle(buildNext);
      }
    };

    const resize = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.target as HTMLElement);
    });
    const seen = new WeakSet<HTMLElement>();
    const scan = () => {
      document.querySelectorAll<HTMLElement>(GLASS_SELECTOR).forEach((node) => {
        if (node.matches(SKIP)) return;
        if (!seen.has(node)) {
          seen.add(node);
          resize.observe(node);
        }
        apply(node);
      });
    };

    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 200);
    };
    scan();
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    // The light: every lens is lit from the side the pointer (or finger) is on, measured from the middle of the screen.
    let frame = 0;
    let last: PointerEvent | null = null;
    const aim = () => {
      frame = 0;
      if (!last) return;
      const angle = Math.round((Math.atan2(last.clientY - window.innerHeight / 2, last.clientX - window.innerWidth / 2) * 180) / Math.PI);
      defs.querySelectorAll("feDistantLight").forEach((l) => l.setAttribute("azimuth", String(angle)));
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(aim);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });

    return () => {
      mo.disconnect();
      resize.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      if (frame) cancelAnimationFrame(frame);
      defs.remove();
    };
  }, []);

  return null;
}
