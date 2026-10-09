import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Plivo Verify: it "texts" a session, and says a code is right only if it is 123456.
const state = { sessions: [] as string[], outage: false };
vi.mock("@/lib/sms", () => ({
  smsAvailable: () => true,
  isSmsConfigured: () => true,
  sendSms: async () => undefined,
  startVerifySession: async () => {
    const id = `session-${state.sessions.length + 1}`;
    state.sessions.push(id);
    return id;
  },
  checkVerifySession: async (_session: string, code: string) => (state.outage ? "error" : code === "123456" ? "valid" : "invalid"),
}));

import { confirmPhoneVerification, resendPhoneCode, startPhoneVerification } from "@/lib/phoneVerification";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("pp");
const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
const fresh = () => `+1${2 + Math.floor(Math.random() * 8)}${rnd(2)}${2 + Math.floor(Math.random() * 8)}${rnd(6)}`;
let user: { id: string; email: string };

beforeAll(async () => {
  user = await makeUser(tag, "Plivo Pat");
});
beforeEach(async () => {
  state.sessions.length = 0;
  state.outage = false;
  await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { phone: null, phoneVerifiedAt: null, pendingPhone: null } });
});
afterAll(async () => {
  await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

describe("phone verification through the provider", () => {
  it("starts a session, keeps no code of its own, and confirms with the provider's answer", async () => {
    const phone = fresh();
    expect(await startPhoneVerification(user.id, phone)).toEqual({ ok: true, phone });
    expect(state.sessions).toEqual(["session-1"]);
    const row = await prisma.verificationCode.findFirstOrThrow({ where: { userId: user.id, purpose: "PHONE_VERIFY" } });
    expect(row.codeHash).toBe("provider");
    expect(row.payload).toMatchObject({ phone, session: "session-1" });

    expect((await confirmPhoneVerification(user.id, "000000")).ok).toBe(false);
    expect(await confirmPhoneVerification(user.id, "123456")).toEqual({ ok: true, phone });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([after.phone, after.pendingPhone]).toEqual([phone, null]);
    expect(after.phoneVerifiedAt).not.toBeNull();
  });

  it("a verified code cannot be used a second time", async () => {
    await startPhoneVerification(user.id, fresh());
    expect((await confirmPhoneVerification(user.id, "123456")).ok).toBe(true);
    expect((await confirmPhoneVerification(user.id, "123456")).ok).toBe(false);
  });

  it("stops after too many wrong tries, even if the next one would be right", async () => {
    await startPhoneVerification(user.id, fresh());
    for (let i = 0; i < 5; i++) expect((await confirmPhoneVerification(user.id, "000000")).ok).toBe(false);
    const locked = await confirmPhoneVerification(user.id, "123456");
    expect(locked).toMatchObject({ ok: false });
  });

  it("does not count a provider outage against the person", async () => {
    await startPhoneVerification(user.id, fresh());
    state.outage = true;
    for (let i = 0; i < 8; i++) expect((await confirmPhoneVerification(user.id, "123456")).ok).toBe(false);
    state.outage = false;
    expect((await confirmPhoneVerification(user.id, "123456")).ok).toBe(true);
  });

  it("a resend replaces the earlier session, and only the newest counts", async () => {
    await startPhoneVerification(user.id, fresh());
    await resendPhoneCode(user.id);
    expect(state.sessions).toHaveLength(2);
    const open = await prisma.verificationCode.findMany({ where: { userId: user.id, purpose: "PHONE_VERIFY", consumedAt: null } });
    expect(open).toHaveLength(1);
    expect(open[0].payload).toMatchObject({ session: "session-2" });
  });

  it("limits how many verification texts one account can request", async () => {
    let refused = 0;
    await startPhoneVerification(user.id, fresh());
    for (let i = 0; i < 8; i++) if (!(await resendPhoneCode(user.id)).ok) refused++;
    expect(refused).toBeGreaterThan(0);
    expect(state.sessions.length).toBeLessThanOrEqual(5);
  });
});
