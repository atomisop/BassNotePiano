import { describe, expect, it } from "vitest";
import { heroVideoAllowed } from "@/lib/heroVideo";

const ok = { reducedMotion: false, saveData: false, effectiveType: "4g" };

describe("heroVideoAllowed", () => {
  it("plays on a normal connection, or when the browser does not say", () => {
    expect(heroVideoAllowed(ok)).toBe(true);
    expect(heroVideoAllowed({ ...ok, effectiveType: null })).toBe(true);
  });
  it("skips the 17MB file for reduced motion, data saver and slow connections", () => {
    expect(heroVideoAllowed({ ...ok, reducedMotion: true })).toBe(false);
    expect(heroVideoAllowed({ ...ok, saveData: true })).toBe(false);
    for (const t of ["slow-2g", "2g", "3g", "3G"]) expect(heroVideoAllowed({ ...ok, effectiveType: t })).toBe(false);
  });
});
