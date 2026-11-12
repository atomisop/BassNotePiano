import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendNewDeviceEmail: async () => undefined }));
import { recordSignInDevice, touchDevice, withSession } from "@/lib/deviceAlerts";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sid");
const ids: string[] = [];
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

afterAll(async () => {
  await prisma.knownDevice.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("one session at a time", () => {
  it("keeps the newest 20 session ids and never repeats one", () => {
    expect(withSession(["a", "b"], "a")).toEqual(["b", "a"]);
    const many = Array.from({ length: 25 }, (_, i) => `s${i}`).reduce<string[]>((acc, x) => withSession(acc, x), []);
    expect(many).toHaveLength(20);
    expect(many[19]).toBe("s24");
  });

  it("two sign-ins on the same kind of device keep their own session ids on one row", async () => {
    const u = await makeUser(tag, "Dev One");
    ids.push(u.id);
    await recordSignInDevice({ id: u.id, email: u.email, name: "Dev One" }, CHROME_WIN, undefined, "sid-victim");
    await recordSignInDevice({ id: u.id, email: u.email, name: "Dev One" }, CHROME_WIN, undefined, "sid-thief");
    const rows = await prisma.knownDevice.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionIds).toEqual(["sid-victim", "sid-thief"]);
  });

  it("a session replayed under another browser label is recorded on that label's row", async () => {
    const u = await makeUser(tag, "Dev Two");
    ids.push(u.id);
    await recordSignInDevice({ id: u.id, email: u.email, name: "Dev Two" }, CHROME_WIN, undefined, "sid-1");
    await touchDevice(u.id, CHROME_MAC, { city: null, region: null, country: null }, "sid-1");
    const rows = await prisma.knownDevice.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.sessionIds.includes("sid-1"))).toHaveLength(2);
  });
});
