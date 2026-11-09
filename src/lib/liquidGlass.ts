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
  /** Bezel width (the band that bends), as a fraction of the smaller side. */
  border?: number;
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

// Physics-based map (the method in kube.io's "Liquid Glass in the Browser" and Aave's "Building glass for the web"): the rim is a convex
// squircle bezel, f(x) = (1 - (1 - x)^4)^(1/4) for x from 0 at the outer edge to 1 at the inner end of the bezel. Its slope gives a surface
// normal, Snell's law (air 1.0 to glass 1.5) bends a straight-down ray against it, and the bend times the glass height is how far that pixel
// is pushed, always along the edge's outward normal. Red = x push, green = y push, 128 = neutral; the interior stays neutral so only the
// bezel refracts. Magnitudes are normalised to 1 so `scale` is the peak push in px.
const GLASS_INDEX = 1.5;

function bezelProfile(samples: number): Float32Array {
  const f = (x: number) => Math.pow(1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 4), 0.25);
  const out = new Float32Array(samples);
  let max = 0;
  for (let i = 0; i < samples; i++) {
    const x = (i + 0.5) / samples;
    const d = 0.001;
    const slope = (f(x + d) - f(x - d)) / (2 * d);
    const sin1 = Math.abs(slope) / Math.sqrt(1 + slope * slope);
    const t1 = Math.asin(Math.min(sin1, 1));
    const t2 = Math.asin(sin1 / GLASS_INDEX);
    out[i] = Math.tan(t1 - t2) * f(x);
    max = Math.max(max, out[i]);
  }
  if (max > 0) for (let i = 0; i < samples; i++) out[i] /= max;
  return out;
}

function makeMap(w: number, h: number, radius: number, border: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const bezel = Math.max(border * Math.min(w, h), 1);
  const profile = bezelProfile(128);
  const img = ctx.createImageData(w, h);
  const hx = w / 2;
  const hy = h / 2;
  const r = Math.min(radius, hx, hy);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = px + 0.5 - hx;
      const dy = py + 0.5 - hy;
      const qx = Math.abs(dx) - (hx - r);
      const qy = Math.abs(dy) - (hy - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      // Signed distance to the rounded rectangle's edge; negative inside. `inside` is how far in from the edge.
      const inside = -(outside + Math.min(Math.max(qx, qy), 0) - r);
      let nx = 0;
      let ny = 0;
      if (inside < bezel) {
        if (qx > 0 && qy > 0) {
          nx = (qx / outside) * Math.sign(dx);
          ny = (qy / outside) * Math.sign(dy);
        } else if (qx > qy) nx = Math.sign(dx);
        else ny = Math.sign(dy);
      }
      const i = (py * w + px) * 4;
      let mag = 0;
      if (inside < bezel) mag = profile[Math.min(127, Math.max(0, Math.floor((1 - inside / bezel) * 128)))];
      img.data[i] = 128 + nx * mag * 127;
      img.data[i + 1] = 128 + ny * mag * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
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
    filter.appendChild(make("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale: scales[i], xChannelSelector: "R", yChannelSelector: "G", result: `d${i}` }));
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
  const o = { scale: -112, chroma: 6, border: 0.07, blur: 3, saturate: 1.5, radius: null as number | null, fallbackBlur: 16, ...opts };

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
    parts.feImage.setAttribute("href", makeMap(w, h, resolveRadius(el, w, h, o.radius), o.border));
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
