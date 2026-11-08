import { describe, expect, it } from "vitest";
import { instrumentSlug, parseInstrumentIntent } from "@/lib/instrumentIntent";

describe("parseInstrumentIntent", () => {
  it("maps the three taught instruments", () => {
    expect(parseInstrumentIntent("piano")).toBe("PIANO_KEYBOARD");
    expect(parseInstrumentIntent("Guitar")).toBe("GUITAR");
    expect(parseInstrumentIntent(" bass ")).toBe("BASS");
  });
  it("ignores anything else", () => {
    for (const bad of [undefined, null, "", "drums", "vocal", "PIANO_KEYBOARD", ["piano"], 3, "piano;DROP"]) {
      expect(parseInstrumentIntent(bad)).toBeNull();
    }
  });
  it("round trips slugs", () => {
    expect(instrumentSlug("PIANO_KEYBOARD")).toBe("piano");
    expect(instrumentSlug("DRUMS")).toBeNull();
  });
});
