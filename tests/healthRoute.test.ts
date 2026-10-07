import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));
vi.mock("@/lib/reportError", () => ({ reportError: vi.fn() }));

import { GET, dynamic } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("runs on every request, never once at build time (a frozen answer says ok with a dead database)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("answers ok and is never cached when the database responds", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", database: "ok" });
  });

  it("answers 503 when the database is unreachable, without leaking the error", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = JSON.stringify(await res.json());
    expect(body).toContain("unreachable");
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("ECONNREFUSED");
  });

  it("reports a fresh time on each call", async () => {
    queryRaw.mockResolvedValue([1]);
    const a = (await (await GET()).json()).checkedAt;
    await new Promise((r) => setTimeout(r, 5));
    const b = (await (await GET()).json()).checkedAt;
    expect(a).not.toBe(b);
  });
});
