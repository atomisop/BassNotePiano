import { describe, expect, it } from "vitest";
import { buildStrictCsp, isProtectedPath, newNonce, summarizeCspReport } from "@/lib/csp";

describe("stricter CSP", () => {
  it("uses a fresh nonce and strict-dynamic for scripts, and no unsafe-inline for scripts", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    const csp = buildStrictCsp(a, false, {});
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toContain(`'nonce-${a}'`);
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(csp).toContain("report-uri /api/csp-report");
  });
  it("allows eval only in development and includes the R2 origins when configured", () => {
    expect(buildStrictCsp("n", true, {})).toContain("'unsafe-eval'");
    const csp = buildStrictCsp("n", false, { R2_PUBLIC_URL: "https://files.example.com/x", R2_ACCOUNT_ID: "acc", R2_BUCKET_NAME: "bkt" });
    expect(csp).toContain("img-src 'self' data: blob: https://images.unsplash.com https://files.example.com");
    expect(csp).toContain("https://bkt.acc.r2.cloudflarestorage.com");
  });
  it("keeps the same protected pages as the old middleware matcher", () => {
    for (const p of ["/dashboard", "/admin/users", "/messages", "/about", "/onboarding", "/scales/x/y"]) expect(isProtectedPath(p)).toBe(true);
    for (const p of ["/", "/pricing", "/login", "/about/team", "/onboarding/x", "/dashboards"]) expect(isProtectedPath(p)).toBe(false);
  });
  it("summarizes both report formats and drops query strings", () => {
    const legacy = summarizeCspReport({ "csp-report": { "violated-directive": "script-src-elem", "blocked-uri": "https://evil.test/a.js?token=1", "document-uri": "https://x.test/p?secret=1" } });
    expect(legacy).toContain("blocked=https://evil.test/a.js");
    expect(legacy).not.toContain("token");
    expect(legacy).not.toContain("secret");
    expect(summarizeCspReport([{ body: { effectiveDirective: "script-src", blockedURL: "inline" } }])).toContain("directive=script-src blocked=inline");
    expect(summarizeCspReport({ "csp-report": { "blocked-uri": "a\nCSP violation: forged" } })).not.toContain("\n");
    expect(summarizeCspReport("nope")).toBeNull();
  });
});
