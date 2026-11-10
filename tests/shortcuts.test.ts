import { describe, expect, it } from "vitest";
import { goKeysFor, nextShortcutStep, GO_SHORTCUTS } from "@/lib/shortcuts";

describe("keyboard shortcuts", () => {
  it("G waits for a second key, then goes", () => {
    expect(nextShortcutStep("g", false, false)).toEqual({ kind: "wait" });
    expect(nextShortcutStep("f", true, false)).toEqual({ kind: "go", href: "/friends" });
  });
  it("a second key that goes nowhere does nothing, and admin pages stay admin-only", () => {
    expect(nextShortcutStep("z", true, false)).toEqual({ kind: "none" });
    expect(nextShortcutStep("a", true, false)).toEqual({ kind: "none" });
    expect(nextShortcutStep("a", true, true)).toEqual({ kind: "go", href: "/admin" });
  });
  it("slash, question mark and B fire their events only when G is not waiting", () => {
    expect(nextShortcutStep("/", false, false)).toMatchObject({ kind: "event" });
    expect(nextShortcutStep("?", false, false)).toMatchObject({ kind: "event" });
    expect(nextShortcutStep("b", false, false)).toMatchObject({ kind: "event" });
    expect(nextShortcutStep("b", true, false)).toEqual({ kind: "none" });
  });
  it("every second key is a single, unique letter", () => {
    const keys = GO_SHORTCUTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.length === 1)).toBe(true);
  });
  it("G T opens today's classes and G I the inbox, for admins only", () => {
    expect(nextShortcutStep("t", true, true)).toEqual({ kind: "go", href: "/admin/today" });
    expect(nextShortcutStep("i", true, true)).toEqual({ kind: "go", href: "/admin/support" });
    expect(nextShortcutStep("t", true, false)).toEqual({ kind: "none" });
    expect(nextShortcutStep("i", true, false)).toEqual({ kind: "none" });
    expect(goKeysFor("/admin/today")).toEqual(["G", "T"]);
  });
  it("names the keys for a destination, or none", () => {
    expect(goKeysFor("/friends")).toEqual(["G", "F"]);
    expect(goKeysFor("/nowhere")).toBeNull();
  });
});
