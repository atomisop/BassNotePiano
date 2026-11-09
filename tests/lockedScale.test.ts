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
  it("offers a free trial class or a plan to a new student", () => {
    const s = gettingStartedStep({ kind: "NONE", applicationPending: false });
    expect(s?.href).toBe("/classes");
    expect(s?.secondary?.href).toBe("/billing/plans");
  });
  it("tells a student whose application is waiting that it is being reviewed", () => {
    expect(gettingStartedStep({ kind: "NONE", applicationPending: true })?.action).toContain("being reviewed");
  });
  it("stays out of the way of anyone with access", () => {
    for (const kind of ["ADMIN", "PAID", "COMPED", "TRIAL"] as const) expect(gettingStartedStep({ kind, applicationPending: false })).toBeNull();
  });
});

describe("getting started copy follows the trial length", () => {
  it("names the configured number of days, or leaves the trial out when it is off", () => {
    expect(gettingStartedStep({ kind: "NONE", applicationPending: false, trialDays: 5 })?.detail).toContain("5 days");
    expect(gettingStartedStep({ kind: "NONE", applicationPending: false, trialDays: 0 })?.detail).not.toMatch(/trial|days/);
  });
});

describe("Home for a parent and for someone whose trial ran", () => {
  it("never pitches a free trial to a parent who only manages children: it opens Parent mode", () => {
    const one = gettingStartedStep({ kind: "NONE", applicationPending: false, children: 1 });
    expect(one?.href).toBe("/parent");
    expect(one?.action).toBe("Your child's classes");
    expect(`${one?.cta} ${one?.detail}`).not.toMatch(/trial/i);
    expect(gettingStartedStep({ kind: "NONE", applicationPending: false, children: 2 })?.action).toBe("Your children's classes");
  });
  it("a parent learning too (with access) is not given the parent step", () => {
    expect(gettingStartedStep({ kind: "PAID", applicationPending: false, children: 2 })).toBeNull();
  });
  it("after the free trial ran, offers plans instead of a second trial", () => {
    const s = gettingStartedStep({ kind: "NONE", applicationPending: false, trialUsed: true, trialDays: 3 });
    expect(s?.href).toBe("/billing/plans");
    expect(s?.cta).not.toMatch(/trial/i);
  });
});
