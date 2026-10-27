import { describe, expect, it } from "vitest";
import { reservationCovers, validateReservationContact } from "@/lib/ownerReservations";

const day = new Date(Date.UTC(2031, 0, 7));
const base = { scheduleId: "s1", occurrenceDate: day, chunkIndex: null as number | null, releasedAt: null };

describe("reservationCovers", () => {
  it("a whole-window reservation keeps every hour of that window that day", () => {
    expect(reservationCovers(base, "s1", day, 0)).toBe(true);
    expect(reservationCovers(base, "s1", day, 3)).toBe(true);
  });
  it("an hour reservation keeps only that hour", () => {
    expect(reservationCovers({ ...base, chunkIndex: 1 }, "s1", day, 1)).toBe(true);
    expect(reservationCovers({ ...base, chunkIndex: 1 }, "s1", day, 0)).toBe(false);
  });
  it("another day or another window is not kept", () => {
    expect(reservationCovers(base, "s1", new Date(Date.UTC(2031, 0, 14)), 0)).toBe(false);
    expect(reservationCovers(base, "s2", day, 0)).toBe(false);
  });
  it("a released reservation keeps nothing", () => {
    expect(reservationCovers({ ...base, releasedAt: new Date() }, "s1", day, 0)).toBe(false);
  });
});

describe("validateReservationContact", () => {
  const ok = { name: "Sam Rivera", email: "sam@example.com", phone: "(212) 555-0134" };
  it("accepts a name, an email and a phone", () => expect(validateReservationContact(ok)).toBeNull());
  it("asks for each one that is missing or not real", () => {
    expect(validateReservationContact({ ...ok, name: " " })).toMatch(/name/i);
    expect(validateReservationContact({ ...ok, email: "sam@" })).toMatch(/email/i);
    expect(validateReservationContact({ ...ok, phone: "12" })).toMatch(/phone/i);
  });
});
