import { describe, expect, it } from "vitest";
import { SCALE_GROUPS, SCALE_SLUGS, scaleGroupBySlug, scaleIndexFromSlug } from "./curriculum";

describe("SCALE_GROUPS", () => {
  it("is ordered 0..N-1 with no gaps or duplicates, matching array position", () => {
    SCALE_GROUPS.forEach((group, index) => {
      expect(group.order).toBe(index);
    });
  });

  it("has unique slugs", () => {
    const slugs = SCALE_GROUPS.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("scaleIndexFromSlug", () => {
  it("returns the matching group's order for a known slug", () => {
    expect(scaleIndexFromSlug("scale-0")).toBe(0);
    expect(scaleIndexFromSlug("scale-5")).toBe(5);
  });

  it("returns -1 for an unknown slug", () => {
    expect(scaleIndexFromSlug("scale-99")).toBe(-1);
    expect(scaleIndexFromSlug("")).toBe(-1);
  });

  it("agrees with SCALE_SLUGS' own indexOf for every real slug", () => {
    for (const slug of SCALE_SLUGS) {
      expect(scaleIndexFromSlug(slug)).toBe(SCALE_SLUGS.indexOf(slug));
    }
  });
});

describe("scaleGroupBySlug", () => {
  it("finds the group for a known slug", () => {
    expect(scaleGroupBySlug("scale-2")?.title).toBe("Minor Pentatonic");
  });

  it("returns undefined for an unknown slug", () => {
    expect(scaleGroupBySlug("not-a-scale")).toBeUndefined();
  });
});
