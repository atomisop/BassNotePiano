import { describe, expect, it } from "vitest";
import {
  bendFromDepth,
  buildFilterSvg,
  buildPhiTable,
  channelScales,
  computeDisplacementData,
  filterRegion,
  GLASS_BACKDROP,
  GLASS_RECIPES,
  sdRoundedBox,
} from "@/lib/liquidGlassMaps";

// The values and behaviour of the 21st.dev "Liquid Glass Login" source (reference/liquid-glass-login.tsx).
describe("the 21st.dev glass, ported", () => {
  it("keeps the source's recipe values", () => {
    expect(GLASS_RECIPES.card).toEqual({ radius: 32, bevelDepth: 56, scale: 72, aberration: 16, frost: 0.4, tint: 0.1 });
    expect(GLASS_RECIPES.buttonPrimary.scale).toBe(48);
    expect(GLASS_RECIPES.button.scale).toBe(36);
    expect(GLASS_RECIPES.button).toMatchObject({ radius: 26, bevelDepth: 22, aberration: 14, frost: 0.4 });
    expect(GLASS_RECIPES.field).toEqual({ radius: 16, bevelDepth: 22, scale: 36, aberration: 10, frost: 0.4, tint: 0.06 });
    expect(GLASS_BACKDROP).toEqual({
      refract: "blur(0.5px) saturate(1.85) brightness(1.02)",
      loading: "blur(10px) saturate(1.6) brightness(1.04)",
      simple: "blur(16px) saturate(1.8) brightness(1.05)",
    });
  });

  it("measures a signed distance to a rounded box (negative inside)", () => {
    expect(sdRoundedBox(0, 0, 50, 20, 10)).toBeCloseTo(-20, 5);
    expect(sdRoundedBox(60, 0, 50, 20, 10)).toBeCloseTo(10, 5);
    expect(sdRoundedBox(49, 0, 50, 20, 10)).toBeCloseTo(-1, 5);
  });

  it("bends light at the rim and not at the centre", () => {
    expect(bendFromDepth(1)).toBe(0);
    expect(bendFromDepth(0.1)).toBeGreaterThan(bendFromDepth(0.6));
    const phi = buildPhiTable(20);
    expect(phi.length).toBe(21);
    for (let i = 1; i < phi.length; i++) expect(phi[i]).toBeGreaterThanOrEqual(phi[i - 1]);
  });

  it("encodes the map: neutral grey outside, no shift at the centre, a bright rim at the top left", () => {
    const { data, width, height } = computeDisplacementData({ width: 120, height: 60, radius: 26, bevelDepth: 22 });
    expect(width).toBe(120);
    expect(height).toBe(60);
    const at = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
    };
    expect(at(0, 0)).toEqual({ r: 128, g: 128, b: 128, a: 0 });
    const centre = at(60, 30);
    expect(centre.a).toBe(255);
    expect(Math.abs(centre.r - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.g - 128)).toBeLessThanOrEqual(1);
    // the light comes from the top left, so that rim is brighter than the bottom right one
    expect(at(14, 3).b).toBeGreaterThan(at(105, 56).b);
    // left and right rims bend in opposite directions
    expect(Math.sign(at(2, 30).r - 128)).toBe(-Math.sign(at(117, 30).r - 128));
  });

  it("builds the source's filter: three colour passes, screen blends, the frost blur and a padded region", () => {
    expect(channelScales(72, 16)).toEqual({ red: 88, green: 72, blue: 56 });
    expect(channelScales(36, 0)).toBeNull();
    const region = filterRegion(200, 100, 72, 16);
    expect(region.x).toBe("-46.000%");
    const svg = buildFilterSvg({ id: "f1", mapUrl: "blob:x", width: 200, height: 100, scale: 72, aberration: 16, frost: 0.4 });
    expect(svg.match(/feDisplacementMap/g)?.length).toBe(3);
    expect(svg).toContain('scale="88"');
    expect(svg).toContain('scale="56"');
    expect(svg).toContain('mode="screen"');
    expect(svg).toContain('stdDeviation="0.4"');
    expect(svg).toContain('id="f1"');
  });
});
