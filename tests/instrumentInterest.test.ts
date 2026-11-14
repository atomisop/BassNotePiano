import { describe, expect, it } from "vitest";
import { sanitizeWaitlist, waitlistNote } from "@/lib/instrumentInterest";

describe("the list for instruments that are not open yet", () => {
  it("keeps only the instruments that are really coming soon, once each", () => {
    expect(sanitizeWaitlist(["DRUMS", "VOCAL", "DRUMS"])).toEqual(["DRUMS", "VOCAL"]);
  });
  it("refuses instruments we teach, and anything that is not an instrument", () => {
    expect(sanitizeWaitlist(["PIANO_KEYBOARD", "BASS", "OTHER", "NOPE", 5, null, {}])).toEqual([]);
  });
  it("treats a non-list as empty", () => {
    for (const bad of [null, undefined, "DRUMS", 3, {}]) expect(sanitizeWaitlist(bad)).toEqual([]);
  });
  it("words the note for the owner", () => {
    expect(waitlistNote(["DRUMS"])).toBe("Asked at sign-up to hear when Drums open.");
    expect(waitlistNote(["DRUMS", "VOCAL"])).toBe("Asked at sign-up to hear when Drums and Vocal open.");
  });
});
