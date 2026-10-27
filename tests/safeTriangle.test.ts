import { describe, expect, it } from "vitest";
import { isHeadingForFlyout, pointInTriangle } from "@/lib/safeTriangle";

const flyout = { left: 200, top: 100, bottom: 300 };

describe("pointInTriangle", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  const c = { x: 0, y: 10 };
  it("is true inside and on the edge, false outside", () => {
    expect(pointInTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true);
    expect(pointInTriangle({ x: 5, y: 0 }, a, b, c)).toBe(true);
    expect(pointInTriangle({ x: 8, y: 8 }, a, b, c)).toBe(false);
    expect(pointInTriangle({ x: -1, y: 1 }, a, b, c)).toBe(false);
  });
});

describe("isHeadingForFlyout", () => {
  const leftAt = { x: 100, y: 150 };
  it("keeps the flyout while the pointer moves diagonally toward it", () => {
    expect(isHeadingForFlyout({ x: 150, y: 200 }, leftAt, flyout)).toBe(true);
    expect(isHeadingForFlyout({ x: 190, y: 120 }, leftAt, flyout)).toBe(true);
  });
  it("lets go when the pointer drifts to rows above or below, or backwards", () => {
    expect(isHeadingForFlyout({ x: 120, y: 340 }, leftAt, flyout)).toBe(false);
    expect(isHeadingForFlyout({ x: 150, y: 60 }, leftAt, flyout)).toBe(false);
    expect(isHeadingForFlyout({ x: 60, y: 150 }, leftAt, flyout)).toBe(false);
  });
});
