import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { LAUNCH_SPLASH_SCRIPT, SPLASH_STORAGE_KEY } from "@/lib/launchSplash";

/** Runs the boot script in a fake page and reports whether it marked the page for the opening animation. */
function run(opts: { standalone?: boolean; iosStandalone?: boolean; phone?: boolean; search?: string; navType?: string; seen?: boolean; storageThrows?: boolean }) {
  const attrs: Record<string, string> = {};
  const store = new Map<string, string>(opts.seen ? [[SPLASH_STORAGE_KEY, "1"]] : []);
  const window = {
    location: { search: opts.search ?? "" },
    navigator: { standalone: opts.iosStandalone },
    matchMedia: (q: string) => ({ matches: q.includes("display-mode") ? Boolean(opts.standalone) : q.includes("max-width") ? opts.phone !== false : false }),
    performance: { getEntriesByType: () => [{ type: opts.navType ?? "navigate" }] },
    sessionStorage: {
      getItem: (k: string) => (opts.storageThrows ? (() => { throw new Error("blocked"); })() : store.get(k) ?? null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  const ctx = { window, document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } }, performance: window.performance };
  vm.runInNewContext(LAUNCH_SPLASH_SCRIPT, ctx);
  return { shown: attrs["data-splash"] === "1", stored: store.has(SPLASH_STORAGE_KEY) };
}

describe("the opening animation's boot script", () => {
  it("shows on the first load of a launch of the installed app on a phone, and only once", () => {
    expect(run({ standalone: true })).toEqual({ shown: true, stored: true });
    expect(run({ standalone: true, seen: true }).shown).toBe(false);
  });
  it("also recognises the iPhone's own standalone flag", () => {
    expect(run({ iosStandalone: true }).shown).toBe(true);
  });
  it("never shows in a browser tab, on a tablet or computer, or after a manual reload", () => {
    expect(run({}).shown).toBe(false);
    expect(run({ standalone: true, phone: false }).shown).toBe(false);
    expect(run({ standalone: true, navType: "reload" }).shown).toBe(false);
  });
  it("can be forced for a preview with ?splash=1", () => {
    expect(run({ search: "?splash=1" }).shown).toBe(true);
    expect(run({ search: "?a=1&splash=1", seen: true }).shown).toBe(true);
    expect(run({ search: "?splash=10" }).shown).toBe(false);
  });
  it("does nothing, and cannot break the page, when storage is blocked", () => {
    expect(run({ standalone: true, storageThrows: true }).shown).toBe(false);
  });
});
