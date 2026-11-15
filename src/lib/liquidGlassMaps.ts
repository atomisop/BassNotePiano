// The physics behind the app's one glass material, ported exactly from the 21st.dev "Liquid Glass Login" component by aakashmehra
// (MIT; source kept unchanged in reference/liquid-glass-login.tsx, rules in docs/glass-revamp/DESIGN-SYSTEM.md Rule 1).
//
// A displacement map for one pane of glass of a given size: a signed distance to a rounded box, a phi table that integrates the
// Snell's-law bend (refractive index 1.5) of a squircle dome across the bevel, and the gradient of phi (times a gain of 1.35) as the
// shift. Channels: R = horizontal bend, G = vertical bend, B = rim highlight from a light at the top left, A = the shape. Neutral
// grey (128) means no shift. The map is read by an SVG filter used as `backdrop-filter` (`buildFilter`): three displacement passes
// (red, green, blue each bent a little differently: chromatic aberration), screen-blended, then a faint blur ("frost").
//
// The pure parts (everything but `displacementBlobUrl`) are tested in tests/liquidGlassMaps.test.ts.

export type DisplacementOptions = {
  width: number;
  height: number;
  radius: number;
  bevelDepth: number;
  gain?: number;
  light?: { x: number; y: number };
  dpr?: number;
};

/** One element kind's glass, the values from the 21st.dev source. */
export type GlassRecipe = {
  /** Corner radius in px (999 = pill). The element's own CSS radius wins when it is set. */
  radius: number;
  /** Rim band that bends light, in px. */
  bevelDepth: number;
  /** Displacement strength in px. */
  scale: number;
  /** Chromatic aberration spread in px. */
  aberration: number;
  /** Extra blur after refraction, in px. */
  frost: number;
  /** White body tint 0 to 1. */
  tint: number;
};

/** The three elements of the source, value for value. `buttonPrimary` is the Sign in button (scale 48); every other button is 36. */
export const GLASS_RECIPES = {
  card: { radius: 32, bevelDepth: 56, scale: 72, aberration: 16, frost: 0.4, tint: 0.1 },
  button: { radius: 26, bevelDepth: 22, scale: 36, aberration: 14, frost: 0.4, tint: 0.12 },
  buttonPrimary: { radius: 26, bevelDepth: 22, scale: 48, aberration: 14, frost: 0.4, tint: 0.12 },
  field: { radius: 16, bevelDepth: 22, scale: 36, aberration: 10, frost: 0.4, tint: 0.06 },
} as const satisfies Record<string, GlassRecipe>;

export type GlassKind = keyof typeof GLASS_RECIPES;

/** The backdrop-filter of each mode in the source. `refract` follows the filter's `url(#id)`. */
export const GLASS_BACKDROP = {
  refract: "blur(0.5px) saturate(1.85) brightness(1.02)",
  loading: "blur(10px) saturate(1.6) brightness(1.04)",
  simple: "blur(16px) saturate(1.8) brightness(1.05)",
} as const;

/** Signed distance to a rounded box centred at the origin. <0 inside. */
export function sdRoundedBox(px: number, py: number, halfW: number, halfH: number, r: number) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return inside + outside - r;
}

/** Squircle-dome slope to a Snell's-law bend. `x` = 0 at the rim, 1 at the centre. */
export function bendFromDepth(x: number) {
  const u = 1 - Math.min(1, Math.max(0, x));
  const denom = (1 - u ** 4) ** 0.75;
  if (denom < 1e-6) return 0;
  const thetaI = Math.atan(Math.min(u ** 3 / denom, 8));
  const sinT = Math.sin(thetaI) / 1.5;
  if (sinT >= 1) return Math.sin(thetaI);
  return Math.sin(thetaI - Math.asin(sinT));
}

/** phi(d) = the integral of the bend along the distance from the rim. */
export function buildPhiTable(bevelPx: number) {
  const n = Math.max(1, Math.ceil(bevelPx));
  const phi = new Float32Array(n + 1);
  for (let d = 1; d <= n; d++) phi[d] = phi[d - 1] + bendFromDepth(d / n);
  return phi;
}

export function samplePhi(phi: Float32Array, depth: number) {
  const max = phi.length - 1;
  if (depth <= 0) return phi[0];
  if (depth >= max) return phi[max];
  const i = Math.floor(depth);
  const f = depth - i;
  return phi[i] * (1 - f) + phi[i + 1] * f;
}

export function computeDisplacementData(opts: DisplacementOptions) {
  const dpr = opts.dpr ?? 1;
  const gain = opts.gain ?? 1.35;
  const light = opts.light ?? { x: -0.55, y: -0.85 };
  const lightLen = Math.hypot(light.x, light.y) || 1;
  const lx = light.x / lightLen;
  const ly = light.y / lightLen;

  const W = Math.max(1, Math.round(opts.width * dpr));
  const H = Math.max(1, Math.round(opts.height * dpr));
  const halfW = W / 2;
  const halfH = H / 2;
  const r = Math.min(opts.radius * dpr, halfW, halfH);
  const bevel = Math.max(1, opts.bevelDepth * dpr);
  const phi = buildPhiTable(bevel);

  // Height field over the shape, then displace along its gradient.
  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const d = sdRoundedBox(x - halfW + 0.5, py, halfW, halfH, r);
      field[y * W + x] = d > 0 ? 0 : samplePhi(phi, Math.min(bevel, -d));
    }
  }

  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5;
      const i = (y * W + x) << 2;
      const d = sdRoundedBox(px, py, halfW, halfH, r);

      if (d > 0) {
        data[i] = data[i + 1] = data[i + 2] = 128;
        data[i + 3] = 0;
        continue;
      }

      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(W - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(H - 1, y + 1);
      const dPhiX = (field[y * W + x1] - field[y * W + x0]) / (x1 - x0 || 1);
      const dPhiY = (field[y1 * W + x] - field[y0 * W + x]) / (y1 - y0 || 1);

      // Cap so the rim compresses but never folds over itself.
      const dx = Math.max(-1, Math.min(1, dPhiX * gain));
      const dy = Math.max(-1, Math.min(1, dPhiY * gain));

      let specular = 0;
      if (d >= -bevel) {
        const gx = sdRoundedBox(px + 1, py, halfW, halfH, r) - sdRoundedBox(px - 1, py, halfW, halfH, r);
        const gy = sdRoundedBox(px, py + 1, halfW, halfH, r) - sdRoundedBox(px, py - 1, halfW, halfH, r);
        const len = Math.hypot(gx, gy) || 1;
        const dot = (gx / len) * lx + (gy / len) * ly;
        const rim = 1 - Math.min(1, -d / bevel);
        specular = (Math.max(0, dot) + Math.max(0, -dot) * 0.35) * rim;
      }

      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = Math.round(specular * 255);
      data[i + 3] = 255;
    }
  }

  return { data, width: W, height: H };
}

/** PNG blob URL for feImage (WebKit rejects data: URIs inside feImage). Browser only. */
export async function displacementBlobUrl(opts: DisplacementOptions): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const { data, width, height } = computeDisplacementData(opts);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? URL.createObjectURL(blob) : null;
}

export type FilterOptions = {
  id: string;
  mapUrl: string;
  width: number;
  height: number;
  scale: number;
  aberration: number;
  frost: number;
};

/** The padded filter region of the source, as attributes (percent of the element). */
export function filterRegion(width: number, height: number, scale: number, aberration: number) {
  const pad = Math.ceil(scale + aberration + 4);
  const px = (pad / Math.max(1, width)) * 100;
  const py = (pad / Math.max(1, height)) * 100;
  return { x: `-${px.toFixed(3)}%`, y: `-${py.toFixed(3)}%`, width: `${(100 + 2 * px).toFixed(3)}%`, height: `${(100 + 2 * py).toFixed(3)}%` };
}

/** The scales of the three colour passes: red bends most, blue least. One pass when there is no aberration. */
export function channelScales(scale: number, aberration: number) {
  if (aberration <= 0) return null;
  return { red: scale + aberration, green: scale, blue: Math.max(0, scale - aberration) };
}

/** The source's filter as SVG markup (used where markup is easier than DOM nodes). */
export function buildFilterSvg({ id, mapUrl, width, height, scale, aberration, frost }: FilterOptions) {
  const region = filterRegion(width, height, scale, aberration);
  const map = `<feImage href="${mapUrl}" xlink:href="${mapUrl}" x="0" y="0" width="${width}" height="${height}" result="map" preserveAspectRatio="none"/>`;
  const displace = (s: number, result: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;
  const ch = channelScales(scale, aberration);
  const body = !ch
    ? displace(scale, "rgb")
    : `${displace(ch.red, "dispR")}<feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>` +
      `${displace(ch.green, "dispG")}<feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>` +
      `${displace(ch.blue, "dispB")}<feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>` +
      `<feBlend in="red" in2="green" mode="screen" result="rg"/><feBlend in="rg" in2="blue" mode="screen" result="rgb"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><filter id="${id}" color-interpolation-filters="sRGB" x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}">${map}${body}<feGaussianBlur in="rgb" stdDeviation="${frost}"/></filter></svg>`;
}

/** How the glass can be drawn in this browser, the source's `detectMode`. */
export type GlassMode = "refract" | "simple" | "opaque";

export function detectGlassMode(): GlassMode {
  if (typeof window === "undefined") return "simple";
  if (window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches) return "opaque";
  if (document.documentElement.getAttribute("data-solid-surfaces") === "on") return "opaque";
  const ua = navigator.userAgent;
  const safariLike = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
  const urlBackdrop =
    typeof CSS !== "undefined" && !!CSS.supports && (CSS.supports("backdrop-filter", "url(#x)") || CSS.supports("-webkit-backdrop-filter", "url(#x)"));
  if (safariLike || !urlBackdrop) return "simple";
  return "refract";
}
