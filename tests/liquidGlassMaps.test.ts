import { describe, expect, it } from "vitest";
import { edgeInfo, glassPixel, refractionAt, squircle } from "@/lib/liquidGlassMaps";

describe("liquid glass physics", () => {
  it("the bezel is a convex squircle: flat top, steep edge", () => {
    expect(squircle(0)).toBe(0);
    expect(squircle(1)).toBe(1);
    expect(squircle(0.5)).toBeGreaterThan(0.9);
  });

  it("bends light most at the edge and not at all in the flat middle", () => {
    expect(refractionAt(0.02)).toBeGreaterThan(refractionAt(0.4));
    expect(refractionAt(0.4)).toBeGreaterThan(refractionAt(0.95));
    expect(refractionAt(1)).toBeLessThan(0.05);
  });

  it("measures the depth from the edge of a rounded rectangle and points outward", () => {
    const left = edgeInfo(2, 25, 200, 50, 25);
    expect(left.depth).toBeCloseTo(2, 5);
    expect(left.nx).toBeLessThan(0);
    const top = edgeInfo(100, 3, 200, 50, 25);
    expect(top.depth).toBeCloseTo(3, 5);
    expect(top.ny).toBeLessThan(0);
    expect(edgeInfo(100, 25, 200, 50, 25).depth).toBeCloseTo(25, 5);
  });

  it("shifts nothing in the middle and pushes the edge outward, and lights the upper-left rim most", () => {
    const shape = { width: 200, height: 50, radius: 25, bezel: 16, strength: 16 };
    const max = refractionAt(0.001);
    expect(glassPixel(100, 25, shape, max)).toEqual({ vx: 0, vy: 0, spec: 0 });
    const edge = glassPixel(1.5, 25, shape, max);
    expect(edge.vx).toBeLessThan(0); // the left edge samples from further left
    const upperLeft = glassPixel(8, 8, shape, max).spec;
    const lowerRight = glassPixel(192, 42, shape, max).spec;
    expect(upperLeft).toBeGreaterThan(lowerRight);
    expect(upperLeft).toBeGreaterThan(0.2);
  });
});
