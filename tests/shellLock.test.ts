import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The signed-in shell must not be scrollable by code. `overflow: hidden` boxes still scroll for scrollIntoView, focus() and text drags,
// which slid the whole page island up under the top bar. `overflow: clip` cannot be scrolled at all, so the shell boxes use it.
const layout = readFileSync("src/app/(dashboard)/layout.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

describe("the app shell cannot be scrolled", () => {
  it("both shell boxes use the shell-lock class, not overflow-hidden", () => {
    expect(layout).toMatch(/data-surface="app"[^>]*shell-lock/);
    expect(layout).toMatch(/app-shell-col shell-lock/);
    expect(layout).not.toMatch(/data-surface="app"[^>]*overflow-hidden/);
    expect(layout).not.toMatch(/app-shell-col[^"]*overflow-hidden/);
  });

  it("shell-lock clips (with a hidden fallback for old browsers) and the locked document clips too", () => {
    expect(css).toMatch(/\.shell-lock\s*\{[^}]*overflow:\s*hidden;\s*overflow:\s*clip;/);
    expect(css).toMatch(/html:has\(\[data-surface="app"\]\),\s*body:has\(\[data-surface="app"\]\)\s*\{[^}]*overflow:\s*clip;/);
  });
});
