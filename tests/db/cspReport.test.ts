import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nf-client-connection-ip": `203.0.113.${Math.floor(Math.random() * 200)}` }) }));
import { POST } from "@/app/api/csp-report/route";
import { prisma } from "./helpers";

const marker = `/csp-test-${Date.now()}`;
const body = (blocked: string) => JSON.stringify({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": blocked, "document-uri": `https://app.example.test${marker}?secret=1` } });
const send = (b: string) => POST(new Request("https://app.example.test/api/csp-report", { method: "POST", body: b }));

afterAll(async () => {
  await prisma.cspViolation.deleteMany({ where: { page: marker } });
});

describe("CSP violation reports", () => {
  it("count a repeat of the same thing instead of adding rows, and keep no query string", async () => {
    expect((await send(body("https://cdn.example.com/a.js"))).status).toBe(204);
    expect((await send(body("https://cdn.example.com/b.js?x=1"))).status).toBe(204);
    const rows = await prisma.cspViolation.findMany({ where: { page: marker } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ directive: "script-src-elem", blocked: "https://cdn.example.com", page: marker, count: 2 });
  });

  it("still answer 204 to junk and store nothing for it", async () => {
    expect((await send("not json")).status).toBe(204);
    expect((await send(JSON.stringify({ nothing: true }))).status).toBe(204);
  });
});
