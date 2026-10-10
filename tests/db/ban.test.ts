import { afterAll, describe, expect, it, vi } from "vitest";
// The real sign-in options are under test, but React's request cache only exists inside Next.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { loginStepOneAction } from "@/app/(auth)/login/actions";
import { createSilentCode } from "@/lib/verification";
import { BANNED_MESSAGE } from "@/lib/ban";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ban");

afterAll(async () => {
  await prisma.failedLoginAttempt.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.verificationCode.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
});

async function account(name: string, banned: boolean) {
  return makeUser(tag, name, { passwordHash: await bcrypt.hash("Right-pass-1", 4), emailVerified: new Date(), ...(banned ? { bannedAt: new Date() } : {}) });
}

describe("a banned account cannot sign in", () => {
  it("is told so after the right password, and gets the ordinary error for a wrong one", async () => {
    const u = await account("Banned", true);
    expect(await loginStepOneAction(u.email, "Right-pass-1")).toEqual({ ok: false, error: BANNED_MESSAGE });
    expect(await loginStepOneAction(u.email, "wrong")).toEqual({ ok: false, error: "Invalid email or password." });
  });

  it("an account that is not banned still gets a sign-in code", async () => {
    const u = await account("Fine", false);
    const r = await loginStepOneAction(u.email, "Right-pass-1");
    expect(r).toMatchObject({ ok: true, needsEmailVerification: false });
  });

  it("is refused at the sign-in step even with a valid code (emailed code, reset and verify routes all end here)", async () => {
    const authorize = (authOptions.providers[0] as unknown as { options: { authorize: (c: Record<string, string>) => Promise<unknown> } }).options.authorize;
    const banned = await account("Banned2", true);
    const { code } = await createSilentCode({ email: banned.email, userId: banned.id, purpose: "LOGIN_2FA" });
    await expect(authorize({ email: banned.email, code })).rejects.toThrow("BANNED");

    const fine = await account("Fine2", false);
    const ok = await createSilentCode({ email: fine.email, userId: fine.id, purpose: "LOGIN_2FA" });
    expect(await authorize({ email: fine.email, code: ok.code })).toMatchObject({ id: fine.id });
  });
});
