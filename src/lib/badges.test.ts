import { describe, expect, it } from "vitest";
import { BADGES, BADGES_BY_CODE } from "./badges";

describe("BADGES", () => {
  it("has a unique code per badge", () => {
    const codes = BADGES.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("only uses the three defined categories", () => {
    for (const badge of BADGES) {
      expect(["COURSE", "SOCIAL", "STREAK"]).toContain(badge.category);
    }
  });

  it("gives every badge a non-empty label and description", () => {
    for (const badge of BADGES) {
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
    }
  });
});

describe("BADGES_BY_CODE", () => {
  it("indexes every badge by its code", () => {
    expect(BADGES_BY_CODE.size).toBe(BADGES.length);
    for (const badge of BADGES) {
      expect(BADGES_BY_CODE.get(badge.code)).toBe(badge);
    }
  });
});
