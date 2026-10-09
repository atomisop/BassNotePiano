import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; body: string }[] = [];
vi.mock("@/lib/sms", () => ({
  smsAvailable: () => true,
  isSmsConfigured: () => false, // the built-in code path; the Plivo path has its own test file
  sendSms: async (to: string, body: string) => {
    sent.push({ to, body });
  },
}));

import { confirmPhoneVerification, phoneVerifyMode, removePhone, resendPhoneCode, savePhone, startPhoneVerification } from "@/lib/phoneVerification";
import { freshPhone, makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ph");
const fresh = freshPhone;
const [NUM_A, NUM_B, NUM_C, NUM_D, NUM_E] = [fresh(), fresh(), fresh(), fresh(), fresh()];
const typed = (e164: string) => `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
const ids: string[] = [];
let alice: { id: string; email: string };
let bob: { id: string; email: string };
const lastCode = () => /(\d{6})/.exec(sent[sent.length - 1].body)![1];

beforeAll(async () => {
  alice = await makeUser(tag, "Alice Phone");
  bob = await makeUser(tag, "Bob Phone", { phoneRequired: true });
  ids.push(alice.id, bob.id);
});
beforeEach(async () => {
  sent.length = 0;
  await prisma.verificationCode.deleteMany({ where: { userId: { in: ids } } });
});
afterAll(async () => {
  await prisma.verificationCode.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("phone verification", () => {
  it("refuses something that is not a phone number and sends nothing", async () => {
    const r = await startPhoneVerification(alice.id, "not a number");
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("texts a code to the normalized number, and the number is not the account's until confirmed", async () => {
    const r = await startPhoneVerification(alice.id, typed(NUM_A));
    expect(r).toEqual({ ok: true, phone: NUM_A });
    expect(sent[0].to).toBe(NUM_A);
    const mid = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect(mid.pendingPhone).toBe(NUM_A);
    expect(mid.phone).toBeNull();

    const wrong = await confirmPhoneVerification(alice.id, lastCode() === "000000" ? "111111" : "000000");
    expect(wrong.ok).toBe(false);

    const ok = await confirmPhoneVerification(alice.id, lastCode());
    expect(ok).toEqual({ ok: true, phone: NUM_A });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect(after.phone).toBe(NUM_A);
    expect(after.phoneVerifiedAt).not.toBeNull();
    expect(after.pendingPhone).toBeNull();
  });

  it("a code only works once", async () => {
    await startPhoneVerification(bob.id, typed(NUM_B));
    const code = lastCode();
    expect((await confirmPhoneVerification(bob.id, code)).ok).toBe(true);
    expect((await confirmPhoneVerification(bob.id, code)).ok).toBe(false);
  });

  it("a verified number belongs to one account", async () => {
    // Alice and Bob hold different numbers by now; try to take Alice's.
    const r = await startPhoneVerification(bob.id, typed(NUM_A));
    expect(r).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it("an unconfirmed number does not block anyone else from it", async () => {
    const carol = await makeUser(tag, "Carol Phone");
    ids.push(carol.id);
    await prisma.user.update({ where: { id: carol.id }, data: { pendingPhone: NUM_C } });
    const r = await startPhoneVerification(alice.id, typed(NUM_C));
    expect(r.ok).toBe(true);
  });

  it("asking for a new code replaces the old one", async () => {
    await startPhoneVerification(alice.id, typed(NUM_D));
    const first = lastCode();
    await resendPhoneCode(alice.id);
    const second = lastCode();
    if (first !== second) expect((await confirmPhoneVerification(alice.id, first)).ok).toBe(false);
    expect((await confirmPhoneVerification(alice.id, second)).ok).toBe(true);
  });

  it("an account that had to give a number cannot remove it, but anyone else can", async () => {
    expect((await removePhone(bob.id)).ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).phone).not.toBeNull();
    expect((await removePhone(alice.id)).ok).toBe(true);
    const a = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect([a.phone, a.phoneVerifiedAt]).toEqual([null, null]);
  });

  it("limits how many texts one account can request", async () => {
    let refused = 0;
    for (let i = 0; i < 8; i++) {
      const r = await resendOrStart(alice.id);
      if (!r.ok) refused++;
    }
    expect(refused).toBeGreaterThan(0);
    expect(sent.length).toBeLessThanOrEqual(5);
  });
});

async function resendOrStart(id: string) {
  await prisma.user.update({ where: { id }, data: { pendingPhone: NUM_E } });
  return resendPhoneCode(id);
}

describe("keeping a number without a text", () => {
  it("text confirmation is off unless the owner switches it on", async () => {
    expect(await phoneVerifyMode()).toBe(false);
  });

  it("saves a real-looking number as typed, unverified, and sends no text", async () => {
    const carol = await makeUser(tag, "Carol Typed");
    ids.push(carol.id);
    const phone = freshPhone();
    expect(await savePhone(carol.id, phone)).toEqual({ ok: true, phone });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: carol.id } });
    expect([row.phone, row.phoneVerifiedAt, row.pendingPhone]).toEqual([phone, null, null]);
    expect(sent).toHaveLength(0);
  });

  it("refuses a number that cannot exist, and leaves the old one alone", async () => {
    const dave = await makeUser(tag, "Dave Typed");
    ids.push(dave.id);
    const phone = freshPhone();
    await savePhone(dave.id, phone);
    expect((await savePhone(dave.id, "(555) 234-5678")).ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dave.id } })).phone).toBe(phone);
  });

  it("allows a family to share one number", async () => {
    const e = await makeUser(tag, "Eve Family");
    const f = await makeUser(tag, "Finn Family");
    ids.push(e.id, f.id);
    const phone = freshPhone();
    expect((await savePhone(e.id, phone)).ok).toBe(true);
    expect((await savePhone(f.id, phone)).ok).toBe(true);
  });

  it("changing the number clears an earlier confirmation, because that number is gone", async () => {
    const g = await makeUser(tag, "Gus Changed");
    ids.push(g.id);
    await prisma.user.update({ where: { id: g.id }, data: { phone: freshPhone(), phoneVerifiedAt: new Date() } });
    const next = freshPhone();
    await savePhone(g.id, next);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: g.id } });
    expect([row.phone, row.phoneVerifiedAt]).toEqual([next, null]);
  });
});
