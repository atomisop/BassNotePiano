import { describe, expect, it } from "vitest";
import { SETTING_BY_KEY, SETTING_CATEGORIES, SETTING_DEFS, parseSetting, serializeSetting, storageKeyOf } from "@/lib/siteSettingsDefs";

describe("setting definitions", () => {
  it("has at least 50 settings, each with a unique key and a real category", () => {
    expect(SETTING_DEFS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(SETTING_DEFS.map((d) => d.key)).size).toBe(SETTING_DEFS.length);
    const categories = new Set<string>(SETTING_CATEGORIES.map((c) => c.id));
    for (const d of SETTING_DEFS) expect(categories.has(d.category)).toBe(true);
  });

  it("keeps the two older automation switches on their original stored keys", () => {
    expect(storageKeyOf(SETTING_BY_KEY["access.autoApproveScales"])).toBe("auto_approve_scales");
    expect(storageKeyOf(SETTING_BY_KEY["access.autoApproveApplications"])).toBe("auto_approve_applications");
  });

  it("defaults every number inside its own range", () => {
    for (const d of SETTING_DEFS) if (d.type === "number") expect(d.default >= d.min && d.default <= d.max).toBe(true);
  });
});

describe("parse and serialize", () => {
  it("falls back to the default when nothing is stored or the stored number is out of range", () => {
    const hours = SETTING_BY_KEY["cancel.cutoffHours"];
    expect(parseSetting(hours, undefined)).toBe(24);
    expect(parseSetting(hours, "999999")).toBe(24);
    expect(parseSetting(hours, "12")).toBe(12);
  });

  it("reads toggles stored as 1 or 0", () => {
    const sameDay = SETTING_BY_KEY["booking.allowSameDay"];
    expect(parseSetting(sameDay, "0")).toBe(false);
    expect(parseSetting(sameDay, "1")).toBe(true);
    expect(parseSetting(sameDay, undefined)).toBe(true);
  });

  it("refuses an out-of-range number and an empty text", () => {
    expect(() => serializeSetting(SETTING_BY_KEY["cancel.cutoffHours"], 9999)).toThrow();
    expect(() => serializeSetting(SETTING_BY_KEY["booking.pausedMessage"], "  ")).toThrow();
    expect(serializeSetting(SETTING_BY_KEY["booking.allowSameDay"], false)).toBe("0");
  });
});

describe("text settings with a format", () => {
  it("accepts a comma list of whole numbers and refuses anything else", () => {
    const days = SETTING_BY_KEY["reminders.practiceDays"];
    expect(serializeSetting(days, "1, 3,7")).toBe("1, 3,7");
    expect(() => serializeSetting(days, "soon")).toThrow(/whole numbers/);
    expect(() => serializeSetting(days, "1,,3")).toThrow();
  });
  it("no longer offers settings the booking screen cannot honor", () => {
    expect(SETTING_BY_KEY["booking.subscriberClassesPerWeek"]).toBeUndefined();
    expect(SETTING_BY_KEY["cancel.rescheduleCutoffHours"]).toBeUndefined();
    expect(SETTING_DEFS.length).toBeGreaterThanOrEqual(50);
  });
});
