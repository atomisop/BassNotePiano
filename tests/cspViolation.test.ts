import { describe, expect, it } from "vitest";
import { isBrowserNoise, parseCspViolation } from "@/lib/csp";

const report = (over: Record<string, string>) => ({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://cdn.example.com/lib.js?token=SECRET", "document-uri": "https://app.example.test/lessons?r=abc&rm=x", ...over } });

describe("parseCspViolation", () => {
  it("keeps the rule, a host for what was blocked, and the page path, never a query string or full address", () => {
    expect(parseCspViolation(report({}))).toEqual({ directive: "script-src-elem", blocked: "https://cdn.example.com", page: "/lessons" });
  });
  it("names inline and eval blocks plainly and reads the newer Reporting API shape", () => {
    expect(parseCspViolation(report({ "blocked-uri": "inline" }))?.blocked).toBe("inline");
    expect(parseCspViolation(report({ "blocked-uri": "eval" }))?.blocked).toBe("eval");
    expect(parseCspViolation([{ body: { effectiveDirective: "img-src", blockedURL: "data:image/png;base64,AAAA", documentURL: "https://app.example.test/" } }])).toEqual({ directive: "img-src", blocked: "data:", page: "/" });
  });
  it("ignores anything that is not a report", () => {
    expect(parseCspViolation(null)).toBeNull();
    expect(parseCspViolation({})).toBeNull();
    expect(parseCspViolation({ "csp-report": {} })).toBeNull();
  });
});

describe("isBrowserNoise", () => {
  it("spots a visitor's own extensions and ignores real hosts", () => {
    expect(isBrowserNoise({ directive: "script-src", blocked: "chrome-extension://abc", page: "/" })).toBe(true);
    expect(isBrowserNoise({ directive: "script-src", blocked: "moz-extension://abc", page: "/" })).toBe(true);
    expect(isBrowserNoise({ directive: "script-src", blocked: "https://cdn.example.com", page: "/" })).toBe(false);
    expect(isBrowserNoise({ directive: "script-src", blocked: "inline", page: "/" })).toBe(false);
  });
});
