import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, MAX_FAMILY_MEMBERS, MIN_FAMILY_MEMBERS, OFFERED_PLAN_CADENCE } from "@/lib/classCreditPricing";
import { checkoutTotals, duplicateWeeklyTime, headcount, missingForCheckout, parentHeadcount, parentTimeHolders, parseAudience, parseParentMode, showScholarshipClaim } from "@/lib/planCheckout";
import { DAY_ORDER, formatTimeLabel, formatTimeRange } from "@/lib/weeklyTimeLabels";

const base = { cadence: OFFERED_PLAN_CADENCE, pricing: DEFAULT_PRICING, memberRows: [] as string[] };

describe("family size", () => {
  it("fits more than four people", () => {
    expect(MIN_FAMILY_MEMBERS).toBe(2);
    expect(MAX_FAMILY_MEMBERS).toBeGreaterThan(4);
  });

  it("counts a row as a person the moment it is added, before an email is typed", () => {
    expect(headcount([])).toMatchObject({ people: 1, filled: 0, empty: 0 });
    expect(headcount([""])).toMatchObject({ people: 2, filled: 0, empty: 1 });
    expect(headcount(["a@x.com", "  ", "b@x.com"])).toMatchObject({ people: 4, filled: 2, empty: 1 });
  });

  it("stops adding at the limit, and not before", () => {
    const rows = (n: number) => Array.from({ length: n }, () => "");
    expect(headcount(rows(MAX_FAMILY_MEMBERS - 2)).canAdd).toBe(true);
    const full = headcount(rows(MAX_FAMILY_MEMBERS - 1));
    expect(full.people).toBe(MAX_FAMILY_MEMBERS);
    expect(full.canAdd).toBe(false);
    expect(full.atMax).toBe(true);
  });
});

describe("what it costs right now", () => {
  it("a solo plan is one person's price, and the first payment is the same", () => {
    const t = checkoutTotals({ ...base, term: "TERM_3", audience: "SOLO" });
    expect(t.people).toBe(1);
    expect(t.firstPaymentCents).toBe(t.perPaymentCents);
    expect(t.payments).toBe(3);
    expect(t.perPersonTermCents).toBe(t.perPaymentCents * 3);
    expect(t.classesPerPayment).toBe(4);
  });

  it("a longer plan costs less per payment than the 1 Month plan", () => {
    const monthly = checkoutTotals({ ...base, term: "MONTHLY", audience: "SOLO" });
    const long = checkoutTotals({ ...base, term: "TERM_6", audience: "SOLO" });
    expect(long.perPaymentCents).toBeLessThan(monthly.perPaymentCents);
    expect(long.listPerPaymentCents).toBe(monthly.perPaymentCents);
  });

  it("the owner's personal discount applies to a solo plan only", () => {
    const solo = checkoutTotals({ ...base, term: "TERM_3", audience: "SOLO", personalDiscountPercent: 25 });
    const none = checkoutTotals({ ...base, term: "TERM_3", audience: "SOLO" });
    expect(solo.perPaymentCents).toBeLessThan(none.perPaymentCents);
    const family = checkoutTotals({ ...base, term: "TERM_3", audience: "FAMILY", memberRows: [""], personalDiscountPercent: 25 });
    const familyNone = checkoutTotals({ ...base, term: "TERM_3", audience: "FAMILY", memberRows: [""] });
    expect(family.perPaymentCents).toBe(familyNone.perPaymentCents);
  });

  it("the family total grows with every person added, even an empty row", () => {
    let last = 0;
    for (let extra = 1; extra <= MAX_FAMILY_MEMBERS - 1; extra++) {
      const t = checkoutTotals({ ...base, term: "TERM_6", audience: "FAMILY", memberRows: Array.from({ length: extra }, () => "") });
      expect(t.people).toBe(extra + 1);
      expect(t.firstPaymentCents).toBe(t.perPaymentCents * (extra + 1));
      expect(t.firstPaymentCents).toBeGreaterThan(last);
      last = t.firstPaymentCents;
    }
  });

  it("a family is priced for at least two people before anyone is added, and never past the limit", () => {
    expect(checkoutTotals({ ...base, term: "TERM_3", audience: "FAMILY", memberRows: [] }).people).toBe(MIN_FAMILY_MEMBERS);
    expect(checkoutTotals({ ...base, term: "TERM_3", audience: "FAMILY", memberRows: Array.from({ length: 30 }, () => "") }).people).toBe(MAX_FAMILY_MEMBERS);
  });

  it("each family member pays less than a solo plan of the same length", () => {
    const solo = checkoutTotals({ ...base, term: "TERM_3", audience: "SOLO" });
    const family = checkoutTotals({ ...base, term: "TERM_3", audience: "FAMILY", memberRows: ["a@x.com"] });
    expect(family.perPaymentCents).toBeLessThan(solo.perPaymentCents);
  });
});

describe("what is still missing", () => {
  it("a solo plan needs only a weekly time", () => {
    expect(missingForCheckout({ audience: "SOLO", memberRows: [], slotChosen: false })).toBe("Pick a weekly time");
    expect(missingForCheckout({ audience: "SOLO", memberRows: [], slotChosen: true })).toBeNull();
  });

  it("a family needs each person's email first, then the time", () => {
    expect(missingForCheckout({ audience: "FAMILY", memberRows: [], slotChosen: true })).toMatch(/Add a person/);
    expect(missingForCheckout({ audience: "FAMILY", memberRows: [""], slotChosen: true })).toMatch(/empty email/);
    expect(missingForCheckout({ audience: "FAMILY", memberRows: ["a@x.com", ""], slotChosen: false })).toMatch(/empty email/);
    expect(missingForCheckout({ audience: "FAMILY", memberRows: ["a@x.com", "b@x.com"], slotChosen: false })).toBe("Pick a weekly time");
    expect(missingForCheckout({ audience: "FAMILY", memberRows: ["a@x.com"], slotChosen: true })).toBeNull();
  });
});

describe("the pricing page link", () => {
  it("reads who it is for, and treats anything else as solo", () => {
    expect(parseAudience("family")).toBe("FAMILY");
    expect(parseAudience(" FAMILY ")).toBe("FAMILY");
    expect(parseAudience("solo")).toBe("SOLO");
    expect(parseAudience("")).toBe("SOLO");
    expect(parseAudience(undefined)).toBe("SOLO");
    expect(parseAudience("everyone")).toBe("SOLO");
  });
});

describe("weekly time labels", () => {
  it("reads like a clock", () => {
    expect(formatTimeLabel("00:30")).toBe("12:30 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
    expect(formatTimeLabel("18:05")).toBe("6:05 PM");
    expect(formatTimeRange("18:00", 45)).toBe("6:00 PM to 6:45 PM");
    expect(formatTimeRange("23:30", 45)).toBe("11:30 PM to 12:15 AM");
  });
  it("lists the week Monday first", () => {
    expect(DAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("the price on screen is the price the server charges", () => {
  it("solo, with and without a personal discount, and family, for every plan length", async () => {
    const { calculatePaymentPlanRate, calculateFamilyBundleTotal, DEFAULT_PRICING, OFFERED_PLAN_CADENCE } = await import("@/lib/classCreditPricing");
    const { discountedPlanPriceCents } = await import("@/lib/classCreditPricing");
    for (const term of ["MONTHLY", "TERM_3", "TERM_6"] as const) {
      const list = calculatePaymentPlanRate(OFFERED_PLAN_CADENCE, term, DEFAULT_PRICING).installmentAmountCents;
      const solo = checkoutTotals({ cadence: OFFERED_PLAN_CADENCE, term, pricing: DEFAULT_PRICING, audience: "SOLO" as const, memberRows: [] });
      expect(solo.firstPaymentCents).toBe(list);
      const off = checkoutTotals({ cadence: OFFERED_PLAN_CADENCE, term, pricing: DEFAULT_PRICING, audience: "SOLO", memberRows: [], personalDiscountPercent: 15 });
      expect(off.firstPaymentCents).toBe(discountedPlanPriceCents(list, 15));
      for (const others of [1, 3, 7]) {
        const family = checkoutTotals({ cadence: OFFERED_PLAN_CADENCE, term, pricing: DEFAULT_PRICING, audience: "FAMILY", memberRows: Array(others).fill("a@b.co") });
        expect(family.firstPaymentCents).toBe(calculateFamilyBundleTotal(OFFERED_PLAN_CADENCE, term, others + 1, DEFAULT_PRICING).perStudentMonthlyCents * (others + 1));
      }
    }
  });
});

describe("parent mode", () => {
  const parentBase = { cadence: OFFERED_PLAN_CADENCE, term: "MONTHLY" as const, pricing: DEFAULT_PRICING, audience: "FAMILY" as const };
  it("one child alone is priced like a solo plan, and the parent is not counted", () => {
    const t = checkoutTotals({ ...parentBase, memberRows: ["kid@example.com"], parent: { includeSelf: false } });
    const solo = checkoutTotals({ ...parentBase, audience: "SOLO" as const, memberRows: [] });
    expect(t.people).toBe(1);
    expect(t.perPaymentCents).toBe(solo.perPaymentCents);
    expect(t.firstPaymentCents).toBe(solo.perPaymentCents);
  });
  it("a child plus the parent, or two children, get the group rate for two", () => {
    const withSelf = checkoutTotals({ ...parentBase, memberRows: ["kid@example.com"], parent: { includeSelf: true } });
    const two = checkoutTotals({ ...parentBase, memberRows: ["a@example.com", "b@example.com"], parent: { includeSelf: false } });
    expect(withSelf.people).toBe(2);
    expect(two.people).toBe(2);
    expect(withSelf.perPaymentCents).toBe(two.perPaymentCents);
    expect(withSelf.perPaymentCents).toBeLessThan(checkoutTotals({ ...parentBase, audience: "SOLO" as const, memberRows: [] }).perPaymentCents);
  });
  it("needs at least one child before anything else", () => {
    expect(missingForCheckout({ audience: "FAMILY", memberRows: [], slotChosen: false, parent: true })).toMatch(/child/);
    expect(missingForCheckout({ audience: "FAMILY", memberRows: ["kid@example.com"], slotChosen: false, parent: true })).toBe("Pick a weekly time");
  });
  it("counts people the parent way, and reads ?who=parent", () => {
    expect(parentHeadcount(["a@x.co"], false).people).toBe(1);
    expect(parentHeadcount(["a@x.co"], true).people).toBe(2);
    expect(parseParentMode("parent")).toBe(true);
    expect(parseParentMode("family")).toBe(false);
    expect(parseAudience("parent")).toBe("FAMILY");
    expect(parseAudience("group")).toBe("FAMILY");
  });
});

describe("parent mode weekly times", () => {
  it("needs a time for every filled-in child once, then the parent when they learn too", () => {
    expect(parentTimeHolders(["Kid@Example.com", "", "kid@example.com", "two@example.com"], false)).toEqual([
      { key: "kid@example.com", label: "Kid@Example.com" },
      { key: "two@example.com", label: "two@example.com" },
    ]);
    expect(parentTimeHolders(["kid@example.com"], true).map((h) => h.key)).toEqual(["kid@example.com", "self"]);
    expect(parentTimeHolders([""], true)).toEqual([{ key: "self", label: "You" }]);
  });

  it("spots the same weekly time picked twice", () => {
    expect(duplicateWeeklyTime([{ scheduleId: "a", chunkIndex: 0 }, { scheduleId: "a", chunkIndex: 1 }])).toBe(false);
    expect(duplicateWeeklyTime([{ scheduleId: "a", chunkIndex: 0 }, { scheduleId: "b", chunkIndex: 0 }, { scheduleId: "a", chunkIndex: 0 }])).toBe(true);
    expect(duplicateWeeklyTime([])).toBe(false);
  });
});

describe("showScholarshipClaim: the code link belongs to the 6 Month plan only", () => {
  const base = { canClaim: true, audience: "SOLO" as const, term: "TERM_6", scholarshipPercent: 0 };

  it("shows on the 6 Month plan", () => {
    expect(showScholarshipClaim(base)).toBe(true);
  });
  it("is gone on every other plan length", () => {
    for (const term of ["MONTHLY", "TERM_3", "TERM_12", "", "term_6"]) expect(showScholarshipClaim({ ...base, term })).toBe(false);
  });
  it("is gone for a group or parent plan, once a scholarship is claimed, and where claiming is not possible", () => {
    expect(showScholarshipClaim({ ...base, audience: "FAMILY" })).toBe(false);
    expect(showScholarshipClaim({ ...base, scholarshipPercent: 50 })).toBe(false);
    expect(showScholarshipClaim({ ...base, canClaim: false })).toBe(false);
  });
});
