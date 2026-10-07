import { createHmac } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
process.env.MAILGUN_SIGNING_KEY = "k";
import { POST } from "@/app/api/inbound/mailgun/route";
import { findMailChainProblem, newProbeToken, recordProbeSent } from "@/lib/mailProbe";
import { prisma } from "./helpers";

function req(fields: Record<string, string>) {
  const ts = String(Math.floor(Date.now() / 1000)), token = "t" + Math.random();
  const form = new FormData();
  const all = { timestamp: ts, token, signature: createHmac("sha256", "k").update(ts + token).digest("hex"), recipient: "music@inbox.bassnotepiano.com", from: "Jane <jane@example.com>", ...fields };
  for (const [k, v] of Object.entries(all)) form.set(k, v);
  return new Request("http://x/api/inbound/mailgun", { method: "POST", body: form });
}

afterAll(async () => {
  await prisma.jobRun.deleteMany({ where: { name: { startsWith: "mail-probe" } } });
  await prisma.assistantEscalation.deleteMany({ where: { contactEmail: "jane@example.com" } });
});

describe("the daily mail check, through the real route", () => {
  it("a lost test raises the problem, a fake token does not clear it, the real one does", async () => {
    const token = newProbeToken();
    await recordProbeSent(token);
    await prisma.jobRun.updateMany({ where: { name: "mail-probe-sent", note: token }, data: { ranAt: new Date(Date.now() - 3 * 3_600_000) } });
    expect(await findMailChainProblem()).toContain("never reached the site");

    const fake = await (await POST(req({ subject: "BNP mail check " + "a".repeat(24) }))).json();
    expect(fake.outcome).toBe("ignored");
    expect(await findMailChainProblem()).toContain("never reached the site");

    const ok = await (await POST(req({ subject: "Fwd: BNP mail check " + token, from: "Bass Note Piano <music@bassnotepiano.com>" }))).json();
    expect(ok.outcome).toBe("probe");
    expect(await findMailChainProblem()).toBeNull();
    expect(await prisma.assistantEscalation.count({ where: { source: "EMAIL", contactEmail: "music@bassnotepiano.com" } })).toBe(0);
  });
  it("rejects a message with a bad signature", async () => {
    const form = new FormData();
    form.set("timestamp", String(Math.floor(Date.now() / 1000)));
    form.set("token", "x");
    form.set("signature", "nope");
    const res = await POST(new Request("http://x/api/inbound/mailgun", { method: "POST", body: form }));
    expect(res.status).toBe(403);
  });
});
