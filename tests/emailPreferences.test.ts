import { describe, expect, it } from "vitest";
import { PREFERENCE_COLUMN, isEmailEnabled, practiceBannerAllowed, type EmailPrefs } from "@/lib/emailPreferences";

const all = (value: boolean): EmailPrefs => ({ notifyEmailPayments: value, notifyEmailRoleUpdates: value, notifyEmailSocial: value, notifyEmailReminders: value, notifyEmailClasses: value });

describe("notification switches", () => {
  it("each kind of notice follows its own switch", () => {
    for (const category of Object.keys(PREFERENCE_COLUMN) as (keyof typeof PREFERENCE_COLUMN)[]) {
      const off: EmailPrefs = { ...all(true), [PREFERENCE_COLUMN[category]]: false };
      expect(isEmailEnabled(off, category)).toBe(false);
      for (const other of Object.keys(PREFERENCE_COLUMN) as (keyof typeof PREFERENCE_COLUMN)[]) if (other !== category) expect(isEmailEnabled(off, other)).toBe(true);
    }
  });
  it("has one switch per kind, all different", () => {
    expect(new Set(Object.values(PREFERENCE_COLUMN)).size).toBe(Object.keys(PREFERENCE_COLUMN).length);
  });
});

describe("the practice banner follows the practice reminders switches", () => {
  it("shows only when the owner has them on AND the person has not turned them off", () => {
    expect(practiceBannerAllowed({ ownerEnabled: true, prefs: { notifyEmailReminders: true } })).toBe(true);
    expect(practiceBannerAllowed({ ownerEnabled: true, prefs: { notifyEmailReminders: false } })).toBe(false);
    expect(practiceBannerAllowed({ ownerEnabled: false, prefs: { notifyEmailReminders: true } })).toBe(false);
  });
});
