import { describe, expect, it } from "vitest";
import { applicantNextSteps, holdTimeHref } from "@/lib/applicantSteps";
import { bulkReminderMessage, bulkReminderQuestion } from "@/lib/followUpRules";

const base = { fullName: "Ana Lima", email: "ana@example.com", phone: "+1 212 555 0100" };

describe("an applicant's next step", () => {
  it("offers the plan and the first class on their own page when they have an account", () => {
    const steps = applicantNextSteps({ ...base, status: "APPROVED", account: { id: "u1", banned: false, onPlan: false } });
    expect(steps).toEqual([
      { kind: "setup", label: "Set up plan", href: "/admin/users/u1?do=setup" },
      { kind: "book", label: "Book first class", href: "/admin/users/u1?do=book" },
    ]);
  });

  it("words it for someone already on a plan", () => {
    const steps = applicantNextSteps({ ...base, status: "APPROVED", account: { id: "u1", banned: false, onPlan: true } });
    expect(steps.map((s) => s.label)).toEqual(["Change plan", "Book a class"]);
  });

  it("offers the sign-up link and a held time when they have no account yet", () => {
    const steps = applicantNextSteps({ ...base, status: "APPROVED", account: null });
    expect(steps[0]).toEqual({ kind: "signUpLink", label: "Send sign-up link" });
    expect(steps[1]).toMatchObject({ kind: "hold", label: "Hold a time" });
  });

  it("offers nothing for a pending or rejected application, or a banned account", () => {
    expect(applicantNextSteps({ ...base, status: "PENDING", account: null })).toEqual([]);
    expect(applicantNextSteps({ ...base, status: "REJECTED", account: { id: "u1", banned: false, onPlan: false } })).toEqual([]);
    expect(applicantNextSteps({ ...base, status: "APPROVED", account: { id: "u1", banned: true, onPlan: false } })).toEqual([]);
  });

  it("opens a reservation filled in with their name, email and phone", () => {
    const url = new URL(holdTimeHref(base), "https://x.test");
    expect(url.pathname).toBe("/admin/schedule");
    expect(Object.fromEntries(url.searchParams)).toEqual({ view: "RESERVED", name: "Ana Lima", email: "ana@example.com", phone: "+1 212 555 0100" });
  });
});

describe("Remind all wording", () => {
  it("says how many went and how many were skipped", () => {
    expect(bulkReminderMessage({ sent: [1, 2, 3], skipped: 0 })).toBe("Sent 3 reminders.");
    expect(bulkReminderMessage({ sent: [1], skipped: 2 })).toBe("Sent 1 reminder. 2 skipped: already reminded today, or it no longer applies.");
    expect(bulkReminderMessage({ sent: [], skipped: 4 })).toMatch(/^No reminders sent\. 4 skipped/);
  });

  it("mentions the payer only for overdue bills", () => {
    expect(bulkReminderQuestion("overdue", 3, "Payment overdue")).toMatch(/person who pays/);
    expect(bulkReminderQuestion("trial", 3, "Trial ends within a day")).not.toMatch(/pays/);
    expect(bulkReminderQuestion("trial", 1, "Trial ends within a day")).toMatch(/the 1 person/);
  });

  it("never uses an em dash", () => {
    const all = [bulkReminderMessage({ sent: [1], skipped: 1 }), bulkReminderQuestion("overdue", 2, "x"), ...applicantNextSteps({ ...base, status: "APPROVED", account: null }).map((s) => s.label)];
    for (const s of all) expect(s).not.toMatch(/\u2014/);
  });
});
