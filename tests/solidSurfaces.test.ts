import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_BOOT_SCRIPT } from "@/lib/themes";
import { SOLID_SURFACES_ATTRIBUTE, SOLID_SURFACES_STORAGE_KEY, applySolidSurfaces, readSolidSurfaces, solidSurfacesOn } from "@/lib/solidSurfaces";

function fakeDom(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const attrs = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] });
  vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k), getAttribute: (k: string) => attrs.get(k) ?? null } });
  return { store, attrs };
}

afterEach(() => vi.unstubAllGlobals());

describe("solid surfaces setting", () => {
  it("is off by default", () => {
    fakeDom();
    expect(readSolidSurfaces()).toBe(false);
    expect(solidSurfacesOn()).toBe(false);
  });

  it("turning it on sets the attribute and remembers it; turning it off clears both", () => {
    const { store, attrs } = fakeDom();
    applySolidSurfaces(true);
    expect(attrs.get(SOLID_SURFACES_ATTRIBUTE)).toBe("on");
    expect(store[SOLID_SURFACES_STORAGE_KEY]).toBe("on");
    expect(readSolidSurfaces()).toBe(true);
    expect(solidSurfacesOn()).toBe(true);
    applySolidSurfaces(false);
    expect(attrs.has(SOLID_SURFACES_ATTRIBUTE)).toBe(false);
    expect(store[SOLID_SURFACES_STORAGE_KEY]).toBeUndefined();
  });

  it("still applies for this page when storage refuses", () => {
    const attrs = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k), getAttribute: (k: string) => attrs.get(k) ?? null } });
    expect(readSolidSurfaces()).toBe(false);
    expect(() => applySolidSurfaces(true)).not.toThrow();
    expect(attrs.get(SOLID_SURFACES_ATTRIBUTE)).toBe("on");
  });

  it("the boot script reads the same key and sets the same attribute before first paint", () => {
    expect(THEME_BOOT_SCRIPT).toContain(SOLID_SURFACES_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain(SOLID_SURFACES_ATTRIBUTE);
  });
});
