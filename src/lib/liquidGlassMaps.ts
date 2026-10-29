// The physics behind Liquid Glass, as two small images made on a canvas for one pane of glass of a given size:
//
//  * a DISPLACEMENT map: how far, and which way, each pixel of the page behind the glass is shifted by refraction. Near the edge the glass
//    is a curved bezel (a "convex squircle": height = (1 - (1 - s)^4)^(1/4), s = 0 at the edge to 1 at the bezel's inner end). The slope
//    gives the angle at which light meets the surface, Snell's law (air 1.0, glass 1.5) bends it, and the sideways shift is how far the ray
//    lands from where it would have without glass, taken from inside the glass. The flat middle magnifies gently. Encoded the way feDisplacementMap reads it:
//    red = x, green = y, 128 = no shift.
//  * a SPECULAR map: the thin bright rim where the curved edge catches a light from the upper left (and a fainter one from the lower
//    right), so the edge glows the way real glass does.
//
// Pure functions of the size, so they are cached and tested.

export interface GlassMaps {
  displacement: string;
  /** The glass surface as a height map (alpha = how high the glass is there), for real lighting in the filter. */
  height: string;
  /** A baked rim light, only for browsers that cannot light the surface live (Safari, Firefox). */
  specular: string;
  /** The feDisplacementMap `scale` that turns the map's -1..1 into real pixels of shift. */
  scale: number;
}

export interface GlassShape {
  width: number;
  height: number;
  /** Corner radius in px (half the height for a pill). */
  radius: number;
  /** Width of the curved edge in px. */
  bezel: number;
  /** The largest shift in px (at the very edge). */
  strength: number;
  /** How much the flat middle magnifies what is behind it, 0 (none) to 1 (strong). A lens enlarges its whole face, not only its rim. */
  magnify?: number;
}

const N_GLASS = 1.5;
const MAX_ANGLE = (82 * Math.PI) / 180;

/** The glass height at s (0 edge .. 1 end of bezel): a convex squircle. */
export const squircle = (s: number) => Math.pow(1 - Math.pow(1 - s, 4), 0.25);

/** How strongly a ray is shifted at s: the sideways distance between the bent ray and the straight one, before normalizing. */
export function refractionAt(s: number): number {
  const delta = 0.001;
  const a = Math.max(0, s - delta);
  const b = Math.min(1, s + delta);
  const slope = Math.abs((squircle(b) - squircle(a)) / (b - a));
  const theta1 = Math.min(MAX_ANGLE, Math.atan(slope));
  const theta2 = Math.asin(Math.sin(theta1) / N_GLASS);
  return Math.tan(theta1) - Math.tan(theta2);
}

/** Distance in px from a point to the inside of a rounded rectangle's edge (positive inside), and the outward direction there. */
export function edgeInfo(px: number, py: number, w: number, h: number, r: number): { depth: number; nx: number; ny: number } {
  const cx = w / 2;
  const cy = h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const qx = Math.abs(dx) - (cx - r);
  const qy = Math.abs(dy) - (cy - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const signed = outside + Math.min(Math.max(qx, qy), 0) - r; // negative inside
  let nx: number;
  let ny: number;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy) || 1;
    nx = (Math.sign(dx) * qx) / len;
    ny = (Math.sign(dy) * qy) / len;
  } else if (qx > qy) {
    nx = Math.sign(dx) || 1;
    ny = 0;
  } else {
    nx = 0;
    ny = Math.sign(dy) || 1;
  }
  return { depth: -signed, nx, ny };
}

/** The per-pixel numbers (no canvas), exported so they can be tested: displacement vector in -1..1 and specular alpha in 0..1. */
export function glassPixel(px: number, py: number, shape: GlassShape, maxRefraction: number): { vx: number; vy: number; spec: number; shade: number } {
  const { width, height, radius, bezel } = shape;
  const { depth, nx, ny } = edgeInfo(px, py, width, height, radius);
  if (depth < 0) return { vx: 0, vy: 0, spec: 0, shade: 0 };
  if (depth >= bezel) {
    // The flat face: sample a little closer to the center, which magnifies what is behind it (more toward the ends).
    const k = (shape.magnify ?? 0.4) * 0.5;
    return { vx: (-(px - width / 2) / (width / 2)) * k, vy: (-(py - height / 2) / (height / 2)) * k, spec: 0, shade: 0 };
  }
  const s = Math.min(1, depth / bezel);
  const m = Math.min(1, refractionAt(s) / maxRefraction);
  // Light from the upper left (strong) and the lower right (faint), concentrated in a thin rim along the edge.
  const rim = Math.max(0, 1 - depth / Math.max(2.5, bezel * 0.22));
  const l1 = Math.max(0, nx * -0.7071 + ny * -0.7071);
  const l2 = Math.max(0, nx * 0.7071 + ny * 0.7071);
  const spec = Math.min(1, rim * rim * (Math.pow(l1, 1.6) * 1 + Math.pow(l2, 1.6) * 0.42 + 0.12));
  // The curved edge also shades what is under it: lighter where it faces the light, darker where it faces away, so the glass has body
  // even over a plain background where there is nothing to bend.
  const shade = Math.min(0.55, Math.pow(1 - s, 2) * (0.1 + 0.5 * Math.pow(l2, 1.2)));
  // A convex lens samples from INSIDE the glass at its rim (that is what magnifies the edge, and it never reaches past the glass, where the
  // browser has no backdrop to show): the shift points inward, against the outward normal.
  return { vx: -nx * m, vy: -ny * m, spec, shade };
}

const cache = new Map<string, GlassMaps>();

export function buildGlassMaps(shape: GlassShape): GlassMaps | null {
  if (typeof document === "undefined") return null;
  const w = Math.max(2, Math.round(shape.width));
  const h = Math.max(2, Math.round(shape.height));
  const key = `${w}x${h}:${Math.round(shape.radius)}:${Math.round(shape.bezel)}:${shape.strength}:${shape.magnify ?? 0.4}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const maxRefraction = refractionAt(0.001);
  const disp = document.createElement("canvas");
  disp.width = w;
  disp.height = h;
  const dctx = disp.getContext("2d");
  const SPEC = 2; // the rim is drawn at twice the resolution so it stays crisp
  const spec = document.createElement("canvas");
  spec.width = w * SPEC;
  spec.height = h * SPEC;
  const sctx = spec.getContext("2d");
  if (!dctx || !sctx) return null;

  const d = dctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { vx, vy } = glassPixel(x + 0.5, y + 0.5, { ...shape, width: w, height: h }, maxRefraction);
      const i = (y * w + x) * 4;
      d.data[i] = Math.round(128 + vx * 127);
      d.data[i + 1] = Math.round(128 + vy * 127);
      d.data[i + 2] = 128;
      d.data[i + 3] = 255;
    }
  }
  dctx.putImageData(d, 0, 0);

  const sw = w * SPEC;
  const sh = h * SPEC;
  const s = sctx.createImageData(sw, sh);
  const scaled: GlassShape = { width: sw, height: sh, radius: shape.radius * SPEC, bezel: shape.bezel * SPEC, strength: shape.strength, magnify: shape.magnify };
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const { spec: a, shade } = glassPixel(x + 0.5, y + 0.5, scaled, maxRefraction);
      const i = (y * sw + x) * 4;
      const alpha = a + shade * (1 - a);
      const c = alpha > 0 ? Math.round((255 * a) / (a + shade + 1e-6)) : 0;
      s.data[i] = c;
      s.data[i + 1] = c;
      s.data[i + 2] = c;
      s.data[i + 3] = Math.round(alpha * 255);
    }
  }
  sctx.putImageData(s, 0, 0);

  // The height map: 0 at the outer edge, rising along the squircle bezel, flat (1) across the face.
  const hc = document.createElement("canvas");
  hc.width = w;
  hc.height = h;
  const hctx = hc.getContext("2d");
  let height = "";
  if (hctx) {
    const hd = hctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { depth } = edgeInfo(x + 0.5, y + 0.5, w, h, shape.radius);
        const a = depth <= 0 ? 0 : depth >= shape.bezel ? 1 : squircle(depth / shape.bezel);
        const i = (y * w + x) * 4;
        hd.data[i] = 255;
        hd.data[i + 1] = 255;
        hd.data[i + 2] = 255;
        hd.data[i + 3] = Math.round(a * 255);
      }
    }
    hctx.putImageData(hd, 0, 0);
    height = hc.toDataURL("image/png");
  }

  const maps: GlassMaps = { displacement: disp.toDataURL("image/png"), height, specular: spec.toDataURL("image/png"), scale: shape.strength * 2 };
  if (cache.size > 60) cache.clear();
  cache.set(key, maps);
  return maps;
}
