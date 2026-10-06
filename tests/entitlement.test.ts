import { describe, expect, it } from "vitest";
import { computeNextApproval, resolveEntitlement, PLAN_GRACE_DAYS, SCALE_UNLOCK_INTERVAL_DAYS } from "@/lib/entitlementRules";

const DAY = 86_400_000;
const now = new Date("2026-10-10T12:00:00Z");

describe("resolveEntitlement", () => {
  it("admins always have access", () => {
    expect(resolveEntitlement({ isAdmin: true, comped: false, planPaidUntil: null, trialEndsAt: null }, now).kind).toBe("ADMIN");
  });
  it("a paid plan counts through its period plus the grace days", () => {
    const paidUntil = new Date(now.getTime() - (PLAN_GRACE_DAYS - 1) * DAY);
    expect(resolveEntitlement({ isAdmin: false, comped: false, planPaidUntil: paidUntil, trialEndsAt: null }, now).kind).toBe("PAID");
    const lapsed = new Date(now.getTime() - (PLAN_GRACE_DAYS + 1) * DAY);
    expect(resolveEntitlement({ isAdmin: false, comped: false, planPaidUntil: lapsed, trialEndsAt: null }, now).kind).toBe("NONE");
  });
  it("a trial only counts until it ends", () => {
    expect(resolveEntitlement({ isAdmin: false, comped: false, planPaidUntil: null, trialEndsAt: new Date(now.getTime() + DAY) }, now).kind).toBe("TRIAL");
    expect(resolveEntitlement({ isAdmin: false, comped: false, planPaidUntil: null, trialEndsAt: new Date(now.getTime() - DAY) }, now).kind).toBe("NONE");
  });
  it("complimentary access outlasts a lapsed plan", () => {
    const lapsed = new Date(now.getTime() - 30 * DAY);
    expect(resolveEntitlement({ isAdmin: false, comped: true, planPaidUntil: lapsed, trialEndsAt: null }, now).kind).toBe("COMPED");
  });
});

describe("computeNextApproval", () => {
  const scale = (order: number, status: "LOCKED" | "COMPLETED", unlockedAt: number | null) => ({ slug: `s${order}`, order, status, unlockedAt });

  it("waits for the previous scale to be finished", () => {
    const result = computeNextApproval([scale(0, "LOCKED", now.getTime() - 20 * DAY), scale(1, "LOCKED", null)], now.getTime());
    expect(result.state).toBe("NEEDS_CHECKLIST");
  });
  it("releases the next scale once the previous one is done and a week has passed", () => {
    const result = computeNextApproval([scale(0, "COMPLETED", now.getTime() - (SCALE_UNLOCK_INTERVAL_DAYS + 1) * DAY), scale(1, "LOCKED", null)], now.getTime());
    expect(result).toEqual({ state: "READY", nextSlug: "s1" });
  });
  it("holds a scale back until a week after the last unlock", () => {
    const result = computeNextApproval([scale(0, "COMPLETED", now.getTime() - 2 * DAY), scale(1, "LOCKED", null)], now.getTime());
    expect(result.state).toBe("WAITING_PACE");
  });
  it("says so when everything is unlocked", () => {
    expect(computeNextApproval([scale(0, "COMPLETED", 1), scale(1, "COMPLETED", 2)], now.getTime()).state).toBe("ALL_UNLOCKED");
  });
});
