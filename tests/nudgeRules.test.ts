import { describe, expect, it } from "vitest";
import { NUDGES_PER_FRIEND_PER_DAY, nudgeBody, nudgeSenderLabel, nudgeTitle } from "@/lib/nudgeRules";

describe("friend nudge wording", () => {
  it("says the friend's first name and nothing a person typed", () => {
    expect(nudgeTitle("Selam Bekele")).toBe("Your friend Selam is reminding you to practice");
    expect(nudgeBody()).toBe("Tap to start your 10 minutes.");
  });
  it("falls back to a username, then to a plain word", () => {
    expect(nudgeSenderLabel("  ")).toBe("A friend");
    expect(nudgeSenderLabel(null)).toBe("A friend");
    expect(nudgeSenderLabel("kal_b")).toBe("kal_b");
  });
  it("cuts a very long name short", () => {
    expect(nudgeSenderLabel("x".repeat(80)).length).toBe(30);
  });
  it("allows two nudges a day per friend", () => {
    expect(NUDGES_PER_FRIEND_PER_DAY).toBe(2);
  });
});
