import { describe, expect, it } from "vitest";
import { describeLockedScale, gettingStartedStep } from "@/lib/lockedScale";

const base = { lockedBecause: "not-yet-approved" as const, slug: "natural-minor", previousTitle: "Scale 1: The Major Scale" };

describe("describeLockedScale", () => {
  it("sends a student with no plan to the plans", () => {
    const m = describeLockedScale({ ...base, lockedBecause: "no-plan", next: { state: "ALL_UNLOCKED" } });
    expect(m.primary?.href).toBe("/billing/plans");
    expect(m.canAsk).toBe(false);
  });
  it("names the unfinished scale and links to it", () => {
    const m = describeLockedScale({ ...base, next: { state: "NEEDS_CHECKLIST", nextSlug: "natural-minor", previousSlug: "major-scale" } });
    expect(m.lines.join(" ")).toContain("The Major Scale");
    expect(m.primary?.href).toBe("/scales/major-scale");
    expect(m.canAsk).toBe(false);
  });
  it("gives the earliest release date when only the weekly pacing is left", () => {
    const m = describeLockedScale(
      { ...base, next: { state: "WAITING_PACE", nextSlug: "natural-minor", availableAt: Date.UTC(2026, 9, 14, 12) } },
      "en-US",
    );
    expect(m.heading).toContain("October 14");
    expect(m.canAsk).toBe(false);
  });
  it("lets a ready student ask the teacher", () => {
    const m = describeLockedScale({ ...base, next: { state: "READY", nextSlug: "natural-minor" } });
    expect(m.canAsk).toBe(true);
  });
  it("says a scale further ahead simply comes later", () => {
    const m = describeLockedScale({ ...base, next: { state: "READY", nextSlug: "some-other-scale" } });
    expect(m.heading).toBe("This scale comes later");
    expect(m.canAsk).toBe(false);
  });
});

describe("gettingStartedStep", () => {
  it("points someone with no access (trial over) at a plan, or a word with an instructor", () => {
    const s = gettingStartedStep({ kind: "NONE" });
    expect(s?.href).toBe("/billing/plans");
    expect(s?.secondary?.href).toBe("/classes");
    // Class applications were removed (2026-11-09): nothing is "being reviewed" any more.
    expect(`${s?.action} ${s?.detail}`).not.toMatch(/apply|application|review/i);
  });
  it("stays out of the way of anyone with access", () => {
    for (const kind of ["ADMIN", "PAID", "COMPED", "TRIAL"] as const) expect(gettingStartedStep({ kind })).toBeNull();
  });
});
