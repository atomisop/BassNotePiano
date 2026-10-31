import { afterAll, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.ADMIN_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
import bcrypt from "bcryptjs";
import { generateSync } from "otplib";
import { authOptions } from "@/lib/auth";
import { loginStepOneAction } from "@/app/(auth)/login/actions";
import { createSilentCode } from "@/lib/verification";
import { beginSetup, confirmSetup, disableTwoStep, TwoStepError } from "@/lib/adminTwoStep";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ts");
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: (c: Record<string, string | undefined>) => Promise<unknown> } }).options.authorize;

afterAll(async () => {
  await prisma.failedLoginAttempt.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.verificationCode.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.rateLimitEvent.deleteMany({ where: { key: { startsWith: "code" } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
});

const PASSWORD = "Right-pass-1";
async function admin(name: string) {
  return makeUser(tag, name, { role: "ADMIN", passwordHash: await bcrypt.hash(PASSWORD, 4), emailVerified: new Date() });
}
/** Sets two-step up the way the Settings page does; returns the plain secret so a test can produce real codes. */
async function enabled(name: string) {
  const u = await admin(name);
  const { secret } = await beginSetup(u.id);
  const backupCodes = await confirmSetup(u.id, generateSync({ secret }));
  // Setup used up this 30 second step; forget it so a test can sign in with the code the app shows right now.
  await prisma.user.update({ where: { id: u.id }, data: { totpLastStep: null } });
  return { u, secret, backupCodes };
}
async function signIn(email: string, id: string, secondStep?: string) {
  const { code } = await createSilentCode({ email, userId: id, purpose: "LOGIN_2FA" });
  return authorize({ email, code, secondStep });
}

describe("admin two-step sign-in", () => {
  it("a student, or an admin who has not turned it on, signs in exactly as before", async () => {
    const plain = await admin("Plain");
    expect(await loginStepOneAction(plain.email, PASSWORD)).toMatchObject({ ok: true, needsEmailVerification: false });
    const student = await makeUser(tag, "Student", { passwordHash: await bcrypt.hash(PASSWORD, 4), emailVerified: new Date() });
    expect(await loginStepOneAction(student.email, PASSWORD)).toMatchObject({ ok: true, needsEmailVerification: false });
    await expect(beginSetup(student.id)).rejects.toBeInstanceOf(TwoStepError);
  });

  it("correct code: password first asks for the second step, then a right code gets in", async () => {
    const { u, secret } = await enabled("Correct");
    expect(await loginStepOneAction(u.email, PASSWORD)).toEqual({ ok: true, needsSecondStep: true });
    const code = generateSync({ secret });
    const step1 = await loginStepOneAction(u.email, PASSWORD, code);
    expect(step1).toMatchObject({ ok: true, needsEmailVerification: false });
    const session = await authorize({ email: u.email, code: (step1 as { autoCode: string }).autoCode, secondStep: code });
    expect(session).toMatchObject({ id: u.id });
  });

  it("wrong code: refused with a plain message and no sign-in code is issued; a wrong password stays generic", async () => {
    const { u } = await enabled("Wrong");
    expect(await loginStepOneAction(u.email, PASSWORD, "000000")).toEqual({ ok: false, error: "That code didn't work. Check it, or use one of your backup codes." });
    expect(await loginStepOneAction(u.email, "bad-password", "000000")).toEqual({ ok: false, error: "Invalid email or password." });
    expect(await signIn(u.email, u.id, "000000")).toBeNull();
  });

  it("no second step at the sign-in itself is refused, so reset and verify routes cannot skip it", async () => {
    const { u } = await enabled("Skip");
    expect(await signIn(u.email, u.id, undefined)).toBeNull();
  });

  it("the same authenticator code cannot be used twice", async () => {
    const { u, secret } = await enabled("Replay");
    const code = generateSync({ secret });
    expect(await signIn(u.email, u.id, code)).toMatchObject({ id: u.id });
    expect(await signIn(u.email, u.id, code)).toBeNull();
  });

  it("a backup code works once, then is refused when reused", async () => {
    const { u, backupCodes } = await enabled("Backup");
    expect(await signIn(u.email, u.id, backupCodes[0].toUpperCase())).toMatchObject({ id: u.id });
    expect(await signIn(u.email, u.id, backupCodes[0])).toBeNull();
    expect(await signIn(u.email, u.id, backupCodes[1])).toMatchObject({ id: u.id });
    expect(await prisma.adminBackupCode.count({ where: { userId: u.id, usedAt: null } })).toBe(6);
  });

  it("wrong codes count toward the same lockout as wrong passwords", async () => {
    const { u } = await enabled("Lockout");
    for (let i = 0; i < 8; i++) await loginStepOneAction(u.email, PASSWORD, "000000");
    const locked = await loginStepOneAction(u.email, PASSWORD, "000000");
    expect(locked).toMatchObject({ ok: false });
    expect((locked as { error: string }).error).toMatch(/Too many failed attempts/);
  });

  it("turning it off needs the password and a current code", async () => {
    const { u, secret } = await enabled("Off");
    await expect(disableTwoStep(u.id, "bad-password", generateSync({ secret }))).rejects.toBeInstanceOf(TwoStepError);
    await expect(disableTwoStep(u.id, PASSWORD, "000000")).rejects.toBeInstanceOf(TwoStepError);
    await disableTwoStep(u.id, PASSWORD, generateSync({ secret }));
    expect(await loginStepOneAction(u.email, PASSWORD)).toMatchObject({ ok: true, needsEmailVerification: false });
  });
});
