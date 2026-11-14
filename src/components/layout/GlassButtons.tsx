"use client";

import { useEffect } from "react";
import { buildFilterSvg, detectGlassMode, displacementBlobUrl, GLASS_RECIPES, type GlassKind } from "@/lib/liquidGlassMaps";

/**
 * The glass engine: live refraction for every card, row, floating panel, field and button in the app, from one place, with the values
 * of the 21st.dev "Liquid Glass Login" component (GLASS_RECIPES). The look itself is CSS (the "Liquid glass everywhere" block in
 * globals.css draws the tint, rim, shadow and a blurred backdrop on its own); this only builds each size's displacement map and SVG
 * filter and hands it to the element through --lg-filter, --lg-r and data-lg-ready.
 *
 * Cost control, so long pages stay smooth on phones:
 *  - only Chromium refracts (Safari and Firefox keep the frosted look, Solid surfaces and reduced transparency keep it solid);
 *  - only elements on screen (or about to be) get a lens; the rest keep the same look without the bend;
 *  - elements of the same kind and size share one filter (widths and heights in 8px steps for cards), at most MAX_FILTERS in all;
 *  - maps are built one at a time when the browser is idle; very large panels (over MAX_MAP_PIXELS) keep the blur.
 */

// A control with its own solid fill (orange, red, amber, white) keeps it.
const SOLID_FILL = ':not([class*="bg-signal"]):not([class*="bg-amber"]):not([class*="bg-red"]):not([class*="bg-white"]):not([data-glass-solid])';

export const GLASS_SELECTOR = [
  '[data-glass-role="button"]',
  ".liquid",
  ".liquid-signal",
  ".neu-btn",
  ".lgx-btn",
  `button[class*="shadow-raised-low"]${SOLID_FILL}`,
  `a[class*="shadow-raised-low"]${SOLID_FILL}`,
  `button[class~="bg-neu-base"]${SOLID_FILL}`,
  `a[class~="bg-neu-base"]${SOLID_FILL}`,
].join(", ");

const CARD_SELECTOR = [".glass-surface", ".glass-surface-elevated", ".glass-surface-modal", ".glass-menu", ".lgx-card", '[class*="shadow-raised-mid"]', '[class*="shadow-raised-high"]'].join(", ");
const FIELD_SELECTOR = [".glass-surface-subtle", ".glass-pill", ".lgx-row", ".lgx-input", '[class~="bg-neu-base"]', '[class~="bg-neu-lift"]', '[class*="shadow-pressed-"]'].join(", ");

const SKIP = "[data-glass], [data-glass] *, [data-no-lens], [data-glass-lens], [data-glass-solid], .color-tile, .hit-slop";
const MAX_FILTERS = 160;
const MAX_MAP_PIXELS = 900_000;

function kindOf(node: HTMLElement): GlassKind | null {
  const tag = node.tagName;
  if (tag === "BUTTON" || tag === "A" || node.matches('[data-glass-role="button"], .liquid, .liquid-signal, .neu-btn, .lgx-btn')) {
    if (!node.matches(GLASS_SELECTOR)) return null;
    return node.matches('.liquid-signal, [data-glass-tone="primary"]') ? "buttonPrimary" : "button";
  }
  if (node.matches(CARD_SELECTOR)) return "card";
  if (node.matches(FIELD_SELECTOR)) return "field";
  return null;
}

export function GlassButtons() {
  useEffect(() => {
    const root = document.documentElement;
    const mode = detectGlassMode();
    root.setAttribute("data-lg-mode", mode);
    if (mode !== "refract") return;

    const defs = document.createElement("div");
    defs.setAttribute("aria-hidden", "true");
    defs.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(defs);

    const made = new Map<string, string>();
    const urls: string[] = [];
    const keyOf = new WeakMap<HTMLElement, string>();
    const pending = new Map<string, { kind: GlassKind; w: number; h: number; r: number; nodes: Set<HTMLElement> }>();
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const idle = (cb: () => void) => (ric ? ric.call(window, cb, { timeout: 500 }) : window.setTimeout(cb, 30));
    let building = false;
    let stopped = false;

    const wear = (node: HTMLElement, id: string, r: number) => {
      if (keyOf.get(node) === id) return;
      keyOf.set(node, id);
      node.style.setProperty("--lg-filter", `url(#${id})`);
      node.style.setProperty("--lg-r", `${r}px`);
      node.setAttribute("data-lg-ready", "");
    };

    const buildNext = async () => {
      const next = pending.entries().next();
      if (next.done || stopped) {
        building = false;
        return;
      }
      const [key, job] = next.value;
      pending.delete(key);
      if (made.size < MAX_FILTERS) {
        const recipe = GLASS_RECIPES[job.kind];
        const short = Math.min(job.w, job.h);
        const panel = job.kind === "card" || job.kind === "field";
        // Small panels bend less (their whole face would be rim, and the text on it would swim), and the colour split smears small
        // labels, so short controls and small panels bend without it. A big card gets the source's values exactly.
        const aberration = panel ? (short < 160 ? 0 : recipe.aberration) : job.h < 40 ? 0 : recipe.aberration;
        const scale = panel ? Math.min(recipe.scale, Math.max(8, Math.round(short * 0.3))) : Math.min(recipe.scale, Math.max(8, Math.round(short * 0.9)));
        const bevelDepth = panel ? Math.min(recipe.bevelDepth, Math.max(8, Math.round(short * 0.22))) : Math.min(recipe.bevelDepth, short / 2);
        const dpr = panel ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        const mapUrl = await displacementBlobUrl({
          width: job.w,
          height: job.h,
          radius: Math.min(job.r, job.w / 2, job.h / 2),
          bevelDepth,
          dpr,
        });
        if (mapUrl && !stopped) {
          urls.push(mapUrl);
          const id = `lgx-${key.replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36)}`;
          const holder = document.createElement("span");
          holder.innerHTML = buildFilterSvg({ id, mapUrl, width: job.w, height: job.h, scale, aberration, frost: recipe.frost });
          defs.appendChild(holder);
          made.set(key, id);
          job.nodes.forEach((n) => wear(n, id, job.r));
        }
      }
      idle(() => void buildNext());
    };

    const apply = (node: HTMLElement) => {
      if (node.matches(SKIP)) return;
      const kind = kindOf(node);
      if (!kind) return;
      const step = kind === "card" || kind === "field" ? 8 : 4;
      const w = Math.round(node.offsetWidth / step) * step;
      const h = kind === "card" || kind === "field" ? Math.round(node.offsetHeight / step) * step : Math.round(node.offsetHeight);
      if (w < 16 || h < 16 || w * h > MAX_MAP_PIXELS) return;
      const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
      const r = Math.min(Math.round(radius), Math.floor(Math.min(w, h) / 2));
      const key = `${kind}-${w}x${h}r${r}`;
      const id = made.get(key);
      if (id) return wear(node, id, r);
      if (made.size >= MAX_FILTERS) return;
      const job = pending.get(key) ?? { kind, w, h, r, nodes: new Set<HTMLElement>() };
      job.nodes.add(node);
      pending.set(key, job);
      if (!building) {
        building = true;
        idle(() => void buildNext());
      }
    };

    // Only what is on screen (or about to be) gets a lens; a size change re-measures it.
    const visible = new WeakSet<HTMLElement>();
    const resize = new ResizeObserver((entries) => {
      for (const e of entries) if (visible.has(e.target as HTMLElement)) apply(e.target as HTMLElement);
    });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const node = e.target as HTMLElement;
          if (e.isIntersecting) {
            visible.add(node);
            apply(node);
          } else visible.delete(node);
        }
      },
      { rootMargin: "200px" },
    );

    const ALL = `${GLASS_SELECTOR}, ${CARD_SELECTOR}, ${FIELD_SELECTOR}`;
    const seen = new WeakSet<HTMLElement>();
    const scan = () => {
      document.querySelectorAll<HTMLElement>(ALL).forEach((node) => {
        if (seen.has(node)) return;
        seen.add(node);
        io.observe(node);
        resize.observe(node);
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

    return () => {
      stopped = true;
      mo.disconnect();
      io.disconnect();
      resize.disconnect();
      window.clearTimeout(timer);
      defs.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  return null;
}
