/**
 * Liquid glass refraction for any element (ported from github.com/deepika-builds/liquid-glass, MIT, installed as the global
 * "liquid-glass" skill). The module owns the optics: an SVG filter, a canvas displacement map, the backdrop-filter wiring, resize handling
 * and the frosted fallback. The tint, rim and shadow stay in CSS.
 *
 * Real bending only where the browser allows an SVG filter on a backdrop (Chrome, Edge, Android). Safari and Firefox get the frosted
 * blur, so the bend must never carry meaning. The filter MUST stay `color-interpolation-filters="sRGB"` (linearRGB ghosts the backdrop).
 */
export type LiquidGlassOptions = {
  /** Displacement strength; negative is a magnifying bulge. -60 subtle, -112 default, -180 dramatic. */
  scale?: number;
  /** Per-channel scale stagger (the prism fringe); 0 turns it off. */
  chroma?: number;
  /** Neutral interior inset, as a fraction of the smaller side. */
  border?: number;
  /** Softness of the bulge's curve in px: small is a hard rim, large a dome. */
  mapBlur?: number;
  /** Backdrop blur inside the glass. */
  blur?: number;
  saturate?: number;
  /** Corner radius override in px; defaults to the element's border-radius. */
  radius?: number | null;
  /** Frosted blur where bending is unsupported. */
  fallbackBlur?: number;
};

export type LiquidGlassHandle = { supported: boolean; refresh: () => void; destroy: () => void };

const SVG_NS = "http://www.w3.org/2000/svg";
let uid = 0;
let svgDefs: SVGDefsElement | null = null;

function canBendBackdrop(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  if (isSafari || /Firefox/.test(ua)) return false;
  return CSS.supports("backdrop-filter", "url(#lg)") && typeof CanvasRenderingContext2D !== "undefined" && "roundRect" in CanvasRenderingContext2D.prototype;
}

function ensureDefs(): SVGDefsElement {
  if (svgDefs && svgDefs.isConnected) return svgDefs;
  const svg = document.createElementNS(SVG_NS, "svg");
  // Zero size but never display:none, or feImage stops drawing.
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svgDefs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(svgDefs);
  document.body.appendChild(svg);
  return svgDefs;
}

// Red left-to-right ramp = x push, blue top-to-bottom ramp = y push; a blurred inset 50% gray rounded rect neutralizes the interior so only an
// edge band refracts.
function makeMap(w: number, h: number, radius: number, border: number, mapBlur: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const gx = ctx.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, "rgb(0,0,0)");
  gx.addColorStop(1, "rgb(255,0,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, w, h);
  const gy = ctx.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, "rgb(0,0,0)");
  gy.addColorStop(1, "rgb(0,0,255)");
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  const inset = border * Math.min(w, h);
  ctx.filter = `blur(${mapBlur}px)`;
  ctx.fillStyle = "rgba(128,128,128,0.93)";
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(radius - inset, 2));
  ctx.fill();
  ctx.filter = "none";
  return canvas.toDataURL();
}

function buildFilter(id: string, scales: number[]) {
  const make = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };
  const filter = make("filter", { id, x: 0, y: 0, width: "100%", height: "100%", "color-interpolation-filters": "sRGB" });
  const feImage = make("feImage", { x: 0, y: 0, result: "map", preserveAspectRatio: "none" });
  filter.appendChild(feImage);
  const keep = ["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"];
  for (let i = 0; i < 3; i++) {
    filter.appendChild(make("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale: scales[i], xChannelSelector: "R", yChannelSelector: "B", result: `d${i}` }));
    filter.appendChild(make("feColorMatrix", { in: `d${i}`, type: "matrix", values: keep[i], result: `c${i}` }));
  }
  filter.appendChild(make("feBlend", { in: "c0", in2: "c1", mode: "screen", result: "c01" }));
  filter.appendChild(make("feBlend", { in: "c01", in2: "c2", mode: "screen" }));
  ensureDefs().appendChild(filter);
  return { filter, feImage };
}

function resolveRadius(el: HTMLElement, w: number, h: number, override: number | null): number {
  if (override != null) return override;
  const raw = getComputedStyle(el).borderTopLeftRadius || "0px";
  const v = parseFloat(raw) || 0;
  return raw.trim().endsWith("%") ? (v / 100) * Math.min(w, h) : v;
}

export function liquidGlass(el: HTMLElement, opts: LiquidGlassOptions = {}): LiquidGlassHandle {
  const o = { scale: -112, chroma: 6, border: 0.07, mapBlur: 12, blur: 3, saturate: 1.5, radius: null as number | null, fallbackBlur: 16, ...opts };

  if (!canBendBackdrop()) {
    const frosted = `blur(${o.fallbackBlur}px) saturate(${o.saturate})`;
    el.style.backdropFilter = frosted;
    el.style.setProperty("-webkit-backdrop-filter", frosted);
    return {
      supported: false,
      refresh() {},
      destroy() {
        el.style.backdropFilter = "";
        el.style.removeProperty("-webkit-backdrop-filter");
      },
    };
  }

  const id = `lg-filter-${++uid}`;
  const parts = buildFilter(id, [o.scale, o.scale + o.chroma, o.scale + 2 * o.chroma]);

  function refresh() {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    parts.feImage.setAttribute("href", makeMap(w, h, resolveRadius(el, w, h, o.radius), o.border, o.mapBlur));
    parts.feImage.setAttribute("width", String(w));
    parts.feImage.setAttribute("height", String(h));
  }

  refresh();
  el.style.backdropFilter = `url(#${id}) blur(${o.blur}px) saturate(${o.saturate})`;

  let timer: number | undefined;
  const ro = new ResizeObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 120);
  });
  ro.observe(el);

  return {
    supported: true,
    refresh,
    destroy() {
      ro.disconnect();
      window.clearTimeout(timer);
      parts.filter.remove();
      el.style.backdropFilter = "";
    },
  };
}
