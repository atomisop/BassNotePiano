import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { createSilentCode, verifyCode, RateLimitError } from "@/lib/verification";
import { newTag, prisma } from "./helpers";

const tag = newTag("lc");
const email = (n: string) => `${tag}-${n}@example.com`;

afterAll(async () => {
  await prisma.verificationCode.deleteMany({ where: { email: { startsWith: tag } } });
});

describe("emailed sign-in codes", () => {
  it("accepts the right code once, then refuses to reuse it", async () => {
    const { code } = await createSilentCode({ email: email("once"), purpose: "EMAIL_VERIFY" });
    expect((await verifyCode(email("once"), "EMAIL_VERIFY", code)).ok).toBe(true);
    const again = await verifyCode(email("once"), "EMAIL_VERIFY", code);
    expect(again).toEqual({ ok: false, reason: "not_found" });
  });
  it("counts wrong guesses and locks the code after five", async () => {
    const { code } = await createSilentCode({ email: email("guess"), purpose: "EMAIL_VERIFY" });
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await verifyCode(email("guess"), "EMAIL_VERIFY", wrong)).toEqual({ ok: false, reason: "incorrect" });
    expect(await verifyCode(email("guess"), "EMAIL_VERIFY", code)).toEqual({ ok: false, reason: "too_many_attempts" });
  });
  it("a new code replaces the old one, and a code is only good for its purpose", async () => {
    const first = await createSilentCode({ email: email("new"), purpose: "EMAIL_VERIFY" });
    const second = await createSilentCode({ email: email("new"), purpose: "EMAIL_VERIFY" });
    if (first.code !== second.code) expect((await verifyCode(email("new"), "EMAIL_VERIFY", first.code)).ok).toBe(false);
    expect((await verifyCode(email("new"), "PASSWORD_RESET", second.code)).ok).toBe(false);
  });
  it("limits how many codes can be requested for one address", async () => {
    for (let i = 0; i < 5; i++) await createSilentCode({ email: email("limit"), purpose: "EMAIL_VERIFY" });
    await expect(createSilentCode({ email: email("limit"), purpose: "EMAIL_VERIFY" })).rejects.toBeInstanceOf(RateLimitError);
  });
  it("an expired code is refused", async () => {
    const { record, code } = await createSilentCode({ email: email("old"), purpose: "EMAIL_VERIFY" });
    await prisma.verificationCode.update({ where: { id: record.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyCode(email("old"), "EMAIL_VERIFY", code)).toEqual({ ok: false, reason: "expired" });
  });
});
