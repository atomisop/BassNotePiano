import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { JWT } from "next-auth/jwt";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));

import { middleware } from "./middleware";
import { getToken } from "next-auth/jwt";

// This mirrors — and is meant to be checked against — the DB-authoritative
// gating matrix in src/lib/access.ts's getRoadmap(). The two independently
// implement "unlocked / curriculum-access(+override) / locked" and must
// agree; see access.test.ts for the DB-side equivalents of several cases
// below (base scale, next-in-line, out-of-order, legacy unlock, locked).
function req(path: string, opts: { cookie?: string; base?: string } = {}) {
  return new NextRequest(`https://app.example.com${path}`, {
    headers: opts.cookie ? { cookie: opts.cookie } : undefined,
  });
}

function token(overrides: Partial<JWT> = {}): JWT {
  return {
    sub: "user1",
    onboarded: true,
    role: "STUDENT",
    hasCurriculumAccess: false,
    unlockedScaleSlugs: [],
    completedScaleSlugs: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getToken).mockReset();
});

describe("middleware — auth gate", () => {
  it("redirects an unauthenticated request to /login with a callbackUrl", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(req("/dashboard"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/dashboard");
  });

  it("lets a public path through with no token at all", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    const res = await middleware(req("/pricing"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware — onboarding gate", () => {
  it("redirects an authenticated but unonboarded user to /onboarding", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ onboarded: false }));

    const res = await middleware(req("/dashboard"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/onboarding");
  });

  it("does not redirect-loop an unonboarded user already on /onboarding", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ onboarded: false }));

    const res = await middleware(req("/onboarding"));

    expect(res.status).toBe(200);
  });
});

describe("middleware — admin gate", () => {
  it("bounces a non-admin away from /admin routes", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ role: "STUDENT" }));

    const res = await middleware(req("/admin/users"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("lets an admin through to /admin routes", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ role: "ADMIN" }));

    const res = await middleware(req("/admin/users"));

    expect(res.status).toBe(200);
  });
});

describe("middleware — scale gating", () => {
  it("lets an unknown scale slug through (the page itself 404s)", async () => {
    vi.mocked(getToken).mockResolvedValue(token());

    const res = await middleware(req("/scales/not-a-real-scale"));

    expect(res.status).toBe(200);
  });

  it("allows a scale that's individually unlocked, even with no curriculum access", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ unlockedScaleSlugs: ["scale-1"] }));

    const res = await middleware(req("/scales/scale-1"));

    expect(res.status).toBe(200);
  });

  it("allows a completed scale", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ completedScaleSlugs: ["scale-0"] }));

    const res = await middleware(req("/scales/scale-0"));

    expect(res.status).toBe(200);
  });

  it("sends a locked scale (no curriculum access, never unlocked) to the curriculum billing page", async () => {
    vi.mocked(getToken).mockResolvedValue(token());

    const res = await middleware(req("/scales/scale-0"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/billing/curriculum");
    expect(location.searchParams.get("next")).toBe("/scales/scale-0");
  });

  it("allows a curriculum-access holder onto the next scale in line without an override", async () => {
    vi.mocked(getToken).mockResolvedValue(
      token({ hasCurriculumAccess: true, completedScaleSlugs: ["scale-0"] }),
    );

    const res = await middleware(req("/scales/scale-1"));

    expect(res.status).toBe(200);
  });

  it("redirects a curriculum-access holder jumping ahead of the roadmap back to /dashboard to confirm", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ hasCurriculumAccess: true }));

    const res = await middleware(req("/scales/scale-3"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("lets a curriculum-access holder through when the override cookie is already set, without re-setting it", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ hasCurriculumAccess: true }));

    const res = await middleware(req("/scales/scale-3", { cookie: "override_scale-3=1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("lets a curriculum-access holder through on ?override=confirmed and stamps the confirmation cookie", async () => {
    vi.mocked(getToken).mockResolvedValue(token({ hasCurriculumAccess: true }));

    const res = await middleware(req("/scales/scale-3?override=confirmed"));

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/override_scale-3=1/);
  });
});
