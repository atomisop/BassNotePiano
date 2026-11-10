import { describe, expect, it } from "vitest";
import { countSeatUnits, MAX_SEATS, parseSeats, seatsLeftNote, seatsLeftOf, seatsNeededByParty } from "@/lib/seatRules";

describe("seats per slot rules", () => {
  it("accepts a whole number from 1 to 1000 and defaults a blank to 1", () => {
    expect(parseSeats(1)).toEqual({ ok: true, seats: 1 });
    expect(parseSeats("12")).toEqual({ ok: true, seats: 12 });
    expect(parseSeats("")).toEqual({ ok: true, seats: 1 });
    expect(parseSeats(MAX_SEATS)).toEqual({ ok: true, seats: 1000 });
  });

  it("refuses zero, negatives, fractions, words and anything above 1000 with a plain message", () => {
    for (const bad of [0, -3, 1.5, "abc", NaN]) expect(parseSeats(bad)).toMatchObject({ ok: false, message: expect.stringMatching(/whole number/) });
    expect(parseSeats(1001)).toEqual({ ok: false, message: "Seats per slot can be at most 1000." });
  });

  it("counts each student once and a plan holder only until it has a class there", () => {
    const s = (studentId: string) => ({ studentId, familyBookingGroupId: null, reservedByPlanId: null });
    expect(countSeatUnits([s("a"), s("b")], [])).toEqual({ booked: 2, held: 0, taken: 2 });
    expect(countSeatUnits([s("a")], [{ userId: "b", familyGroupId: null }])).toEqual({ booked: 1, held: 1, taken: 2 });
    expect(countSeatUnits([s("a")], [{ userId: "a", familyGroupId: null }])).toEqual({ booked: 1, held: 0, taken: 1 });
  });

  it("counts a weekly plan group's classes as one seat, but an ad hoc family as one each", () => {
    const planned = (studentId: string) => ({ studentId, familyBookingGroupId: "g1", reservedByPlanId: "p1" });
    expect(countSeatUnits([planned("a"), planned("b"), planned("c")], [{ userId: "a", familyGroupId: "g1" }]).taken).toBe(1);
    const adHoc = (studentId: string) => ({ studentId, familyBookingGroupId: "g2", reservedByPlanId: null });
    expect(countSeatUnits([adHoc("a"), adHoc("b")], []).taken).toBe(2);
  });

  it("a family needs a seat each but never more than the slot has", () => {
    expect(seatsNeededByParty(2, 1)).toBe(1);
    expect(seatsNeededByParty(3, 5)).toBe(3);
    expect(seatsNeededByParty(8, 5)).toBe(5);
  });

  it("says 'N left' only on a shared slot that is nearly full", () => {
    expect(seatsLeftNote(1, 1)).toBeNull();
    expect(seatsLeftNote(10, 8)).toBeNull();
    expect(seatsLeftNote(10, 3)).toBe("3 left");
    expect(seatsLeftNote(3, 1)).toBe("1 left");
    expect(seatsLeftNote(3, 0)).toBeNull();
    expect(seatsLeftOf(3, 5)).toBe(0);
  });
});
