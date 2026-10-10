import { describe, expect, it } from "vitest";
import { CLASS_MINUTES, CREDITS_PER_CLASS, MINUTES_PER_CREDIT, creditsLabelFromStored, creditsToStored, formatCredits, storedToCredits } from "@/lib/classCreditPricing";
import { discordLinkState } from "@/lib/discordLinkState";

describe("one credit is one 45 minute class", () => {
  it("is fixed by the constants", () => {
    expect(CLASS_MINUTES).toBe(45);
    expect(MINUTES_PER_CREDIT).toBe(45);
    // A class stores CREDITS_PER_CLASS units and is exactly 1 credit.
    expect(storedToCredits(CREDITS_PER_CLASS)).toBe(1);
  });
  it("converts stored units to credits and back without drift", () => {
    for (const credits of [0, 0.5, 1, 1.5, 4, 10, 20]) expect(storedToCredits(creditsToStored(credits))).toBe(credits);
    expect(creditsToStored(4)).toBe(4 * CREDITS_PER_CLASS);
  });
  it("labels credits the way people say them", () => {
    expect(creditsLabelFromStored(CREDITS_PER_CLASS)).toBe("1 credit");
    expect(creditsLabelFromStored(CREDITS_PER_CLASS * 2)).toBe("2 credits");
    expect(creditsLabelFromStored(CREDITS_PER_CLASS * 4.5)).toBe("4.5 credits");
    expect(creditsLabelFromStored(0)).toBe("0 credits");
    expect(formatCredits(3)).toBe("3");
    expect(formatCredits(2.5)).toBe("2.5");
  });
});

describe("the Discord link is read one way everywhere", () => {
  it("is connected exactly when the id is stored, whatever the name says", () => {
    expect(discordLinkState({ discordId: null, discordUsername: null })).toEqual({ connected: false, name: null });
    expect(discordLinkState({ discordId: null, discordUsername: "leftover" })).toEqual({ connected: false, name: null });
    expect(discordLinkState({ discordId: "123", discordUsername: null })).toEqual({ connected: true, name: "Connected" });
    expect(discordLinkState({ discordId: "123", discordUsername: "pat" })).toEqual({ connected: true, name: "pat" });
  });
});
