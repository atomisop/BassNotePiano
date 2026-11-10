import { describe, expect, it } from "vitest";
import {
  addCreditLabel,
  creditShortMessage,
  etTodayKey,
  firstNameOf,
  isOffDay,
  isPastEt,
  nextBookingAsk,
  offDayQuestion,
  typedTimeLabel,
  weekdayOf,
  type BookingAsk,
} from "@/lib/adminBookingRules";

// 2026-11-14 is a Saturday. 15:00 UTC on Nov 9 2026 is 10:00 AM Eastern (EST, UTC-5).
const now = new Date("2026-11-09T15:00:00Z");

describe("days the studio does not usually teach", () => {
  it("reads the weekday of a day and refuses a made-up one", () => {
    expect(weekdayOf("2026-11-14")).toBe(6);
    expect(weekdayOf("2026-02-31")).toBeNull();
    expect(weekdayOf("nope")).toBeNull();
  });

  it("is a day off only when its weekday has no weekly times", () => {
    expect(isOffDay("2026-11-14", [1, 2, 3])).toBe(true);
    expect(isOffDay("2026-11-10", [1, 2, 3])).toBe(false);
  });

  it("asks in plain words, naming the weekday", () => {
    expect(offDayQuestion("2026-11-14")).toBe("You don't usually teach Saturdays. Use it anyway?");
  });
});

describe("a typed time", () => {
  it("knows today in Eastern and whether a time has passed", () => {
    expect(etTodayKey(now)).toBe("2026-11-09");
    expect(isPastEt("2026-11-08", "23:00", now)).toBe(true);
    expect(isPastEt("2026-11-09", "09:59", now)).toBe(true);
    expect(isPastEt("2026-11-09", "10:00", now)).toBe(true);
    expect(isPastEt("2026-11-09", "10:05", now)).toBe(false);
    expect(isPastEt("2026-11-10", "08:00", now)).toBe(false);
  });

  it("reads as a short day and a 12-hour time", () => {
    expect(typedTimeLabel("2026-11-14", "16:05")).toBe("Sat, Nov 14 at 4:05 PM");
    expect(typedTimeLabel("2026-11-14", "00:30")).toBe("Sat, Nov 14 at 12:30 AM");
    expect(typedTimeLabel("2026-11-14", "12:00")).toBe("Sat, Nov 14 at 12:00 PM");
  });
});

describe("the questions a studio booking asks first", () => {
  const base = { typed: false, day: null as string | null, time: "", weekdays: [1, 2, 3], recordPast: true, now };
  const none = new Set<BookingAsk>();

  it("a plain open weekly time asks nothing", () => {
    expect(nextBookingAsk(none, { ...base, day: "2026-11-10" })).toBeNull();
  });

  it("a typed time on a day off asks about the day, then about creating the time, one at a time", () => {
    const c = { ...base, typed: true, day: "2026-11-14", time: "11:00" };
    expect(nextBookingAsk(none, c)).toBe("offday");
    expect(nextBookingAsk(new Set<BookingAsk>(["offday"]), c)).toBe("new");
    expect(nextBookingAsk(new Set<BookingAsk>(["offday", "new"]), c)).toBeNull();
  });

  it("a typed time already past records a class taught (Book), but is a plain new time for Reschedule", () => {
    const c = { ...base, typed: true, day: "2026-11-03", time: "16:00" };
    expect(nextBookingAsk(none, c)).toBe("past");
    expect(nextBookingAsk(none, { ...c, recordPast: false })).toBe("new");
  });

  it("a plan's weekly time and a contact's hold each ask once", () => {
    const c = { ...base, day: "2026-11-10", heldBy: "Ann Lee", heldFor: "Bo Contact" };
    expect(nextBookingAsk(none, c)).toBe("plan");
    expect(nextBookingAsk(new Set<BookingAsk>(["plan"]), c)).toBe("contact");
    expect(nextBookingAsk(new Set<BookingAsk>(["plan", "contact"]), c)).toBeNull();
  });
});

describe("no free credit, worded for the studio", () => {
  it("names the student, says what the class needs, and who can add it", () => {
    expect(creditShortMessage("Sam", 0, 2, true)).toBe("Sam has no free credit, and this class needs 1 credit.");
    expect(creditShortMessage("Sam", 1, 2, false)).toBe("Sam has only 0.5 free, and this class needs 1 credit. Only the owner can add credits.");
    expect(creditShortMessage("Sam", -2, 2, true)).toBe("Sam has no free credit, and this class needs 1 credit.");
  });

  it("offers to add exactly what is short", () => {
    expect(addCreditLabel(2)).toBe("Add 1 credit and book");
    expect(addCreditLabel(1, "confirm")).toBe("Add 0.5 credits and confirm");
  });

  it("uses a first name, or the email's name part", () => {
    expect(firstNameOf({ name: "Sam Lee", email: "s@x.com" })).toBe("Sam");
    expect(firstNameOf({ name: null, email: "pat@x.com" })).toBe("pat");
  });
});
