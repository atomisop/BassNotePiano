import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tiny window: just enough event handling for the live-update helper.
function installWindow() {
  const handlers = new Map<string, Set<(e: Event) => void>>();
  const win = {
    addEventListener: (name: string, fn: (e: Event) => void) => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(fn);
    },
    removeEventListener: (name: string, fn: (e: Event) => void) => handlers.get(name)?.delete(fn),
    dispatchEvent: (e: Event) => {
      handlers.get(e.type)?.forEach((fn) => fn(e));
      return true;
    },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("CustomEvent", class { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } });
  vi.stubGlobal("Event", class { type: string; constructor(type: string) { this.type = type; } });
  return win;
}

describe("live events", () => {
  beforeEach(() => {
    vi.resetModules();
    installWindow();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tells the parts that care, and only those", async () => {
    const { announceChange, onChange } = await import("@/lib/liveEvents");
    const heard: string[] = [];
    onChange("messages", () => heard.push("messages"));
    onChange("notifications", () => heard.push("notifications"));
    announceChange("notifications");
    expect(heard).toEqual(["notifications"]);
  });

  it("a payment touches the bell, the credit badge and the page", async () => {
    const { announceChange, onChange } = await import("@/lib/liveEvents");
    const heard: string[] = [];
    for (const k of ["notifications", "status", "page", "messages"] as const) onChange(k, () => heard.push(k));
    announceChange("payments");
    expect(heard.sort()).toEqual(["notifications", "page", "status"]);
  });

  it("an open chat announcing on every tick is heard now and then, not every time", async () => {
    const { announceChange, onChange } = await import("@/lib/liveEvents");
    let count = 0;
    onChange("messages", () => count++);
    announceChange("messages");
    announceChange("messages");
    announceChange("messages");
    expect(count).toBe(1);
  });

  it("a page refresh is never held back", async () => {
    const { announceChange, onChange } = await import("@/lib/liveEvents");
    let count = 0;
    onChange("page", () => count++);
    announceChange("page");
    announceChange("page");
    expect(count).toBe(2);
  });
});
