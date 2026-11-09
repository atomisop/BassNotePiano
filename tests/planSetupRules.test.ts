import { describe, expect, it } from "vitest";
import { weeksBetweenYmd, checkFirstClass, nextBillSentence, pauseMovesSentence, planMayBookAt, planSetupNotice, resolveScholarship, setupTerm, SETUP_MAX_WEEKS_AHEAD, weekdayOfYmd } from "@/lib/planSetupRules";

const at = (iso: string) => new Date(iso);

describe("planMayBookAt", () => {
  it("books anything on a plan with no first class and no pause", () => {
    expect(planMayBookAt({ startsAt: null, pausedAt: null, pauseUntil: null }, at("2026-11-10T21:00:00Z"))).toBe(true);
  });

  it("never books before the first class, and books from it on", () => {
    const plan = { startsAt: at("2026-11-17T05:00:00Z") };
    expect(planMayBookAt(plan, at("2026-11-10T21:00:00Z"))).toBe(false);
    expect(planMayBookAt(plan, at("2026-11-17T21:00:00Z"))).toBe(true);
  });

  it("never books inside a pause, and books after it ends", () => {
    const plan = { pausedAt: at("2026-11-09T15:00:00Z"), pauseUntil: at("2026-11-17T12:00:00Z") };
    expect(planMayBookAt(plan, at("2026-11-10T21:00:00Z"))).toBe(false);
    expect(planMayBookAt(plan, at("2026-11-17T21:00:00Z"))).toBe(true);
    // A class before the pause began is not the pause's business.
    expect(planMayBookAt(plan, at("2026-11-08T21:00:00Z"))).toBe(true);
  });
});

describe("checkFirstClass", () => {
  it("counts the whole weeks skipped from the next class", () => {
    expect(checkFirstClass({ firstClassYmd: "2026-11-10", dayOfWeek: 2, nextClassYmd: "2026-11-10" })).toEqual({ weeksSkipped: 0 });
    expect(checkFirstClass({ firstClassYmd: "2026-11-17", dayOfWeek: 2, nextClassYmd: "2026-11-10" })).toEqual({ weeksSkipped: 1 });
  });

  it("refuses another weekday, a class already passed, a date too far out and a date that is not real", () => {
    expect(checkFirstClass({ firstClassYmd: "2026-11-18", dayOfWeek: 2, nextClassYmd: "2026-11-10" })).toHaveProperty("error");
    expect(checkFirstClass({ firstClassYmd: "2026-11-03", dayOfWeek: 2, nextClassYmd: "2026-11-10" })).toHaveProperty("error");
    const tooFar = new Date(Date.UTC(2026, 10, 10) + (SETUP_MAX_WEEKS_AHEAD + 1) * 7 * 86_400_000).toISOString().slice(0, 10);
    expect(checkFirstClass({ firstClassYmd: tooFar, dayOfWeek: 2, nextClassYmd: "2026-11-10" })).toHaveProperty("error");
    expect(checkFirstClass({ firstClassYmd: "2026-02-30", dayOfWeek: 1, nextClassYmd: "2026-02-23" })).toHaveProperty("error");
  });

  it("counts whole weeks between two dates, either way", () => {
    expect(weeksBetweenYmd("2026-11-10", "2026-11-24")).toBe(2);
    expect(weeksBetweenYmd("2026-11-24", "2026-11-17")).toBe(-1);
    // Across the change back to standard time the count stays whole.
    expect(weeksBetweenYmd("2026-10-27", "2026-11-03")).toBe(1);
  });

  it("reads the weekday of a calendar date", () => {
    expect(weekdayOfYmd("2026-11-17")).toBe(2);
    expect(weekdayOfYmd("nope")).toBeNull();
  });
});

describe("resolveScholarship", () => {
  it("keeps what is claimed, gives a better one, and never lowers one as a side effect", () => {
    expect(resolveScholarship(0, { kind: "keep" })).toEqual({ percent: 0, grant: null });
    expect(resolveScholarship(0, { kind: "full" })).toEqual({ percent: 100, grant: 100 });
    expect(resolveScholarship(30, { kind: "percent", percent: 50 })).toEqual({ percent: 50, grant: 50 });
    expect(resolveScholarship(100, { kind: "full" })).toEqual({ percent: 100, grant: null });
    expect(resolveScholarship(50, { kind: "percent", percent: 20 })).toHaveProperty("error");
    expect(resolveScholarship(0, { kind: "percent", percent: 0 })).toHaveProperty("error");
    expect(resolveScholarship(0, { kind: "percent", percent: 12.5 })).toHaveProperty("error");
  });

  it("lowers one only when the owner confirms ending the current one, and says which ends", () => {
    expect(resolveScholarship(100, { kind: "percent", percent: 40 })).toEqual({ error: "This account already has a 100% scholarship. To give 40% instead, confirm ending the 100% below." });
    expect(resolveScholarship(100, { kind: "percent", percent: 40, replace: true })).toEqual({ percent: 40, grant: 40, ends: 100 });
    // Confirming means nothing when the new one is not lower.
    expect(resolveScholarship(30, { kind: "percent", percent: 50, replace: true })).toEqual({ percent: 50, grant: 50 });
  });

  it("a scholarship always means the 6 Month plan", () => {
    expect(setupTerm(100, "MONTHLY")).toBe("TERM_6");
    expect(setupTerm(0, "TERM_3")).toBe("TERM_3");
  });
});

describe("wording", () => {
  it("never asks a free plan for a payment", () => {
    const free = planSetupNotice({ weekday: "Tuesday", time: "4:00 PM", firstClassLabel: "Tuesday, November 17", priceCents: 0, started: true, scholarshipPercent: 100 });
    expect(free.body).toBe("Your weekly class is Tuesdays at 4:00 PM, starting Tuesday, November 17. Your scholarship covers everything, so there is nothing to pay.");
    expect(free.body).not.toMatch(/payment/i);
    expect(nextBillSentence(0, "December 15")).not.toMatch(/payment/i);
    expect(pauseMovesSentence(0)).not.toMatch(/payment/i);
  });

  it("tells a paying student about the first payment until it is paid", () => {
    const unpaid = planSetupNotice({ weekday: "Tuesday", time: "4:00 PM", firstClassLabel: "Tuesday, November 17", priceCents: 21999, started: false, scholarshipPercent: 0 });
    expect(unpaid.body).toMatch(/Send the first payment \(\$219\.99\)/);
    const running = planSetupNotice({ weekday: "Tuesday", time: "4:00 PM", firstClassLabel: "Tuesday, November 17", priceCents: 10999, started: true, scholarshipPercent: 50 });
    expect(running.body).toMatch(/\$109\.99 every 28 days with your scholarship/);
    expect(nextBillSentence(21999, "December 15")).toBe("Your next payment is due December 15.");
  });
});
