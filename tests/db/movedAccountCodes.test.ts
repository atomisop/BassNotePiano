import { afterAll, describe, expect, it, vi } from "vitest";

// An unconfirmed sign-up can move to another address (changeSignupEmailAction). A code asked for BEFORE the move must not keep
// working for the account AFTER it: found by the security review as a way to get a session on an unconfirmed account at an address
// the person does not own. The real sign-in and reset steps are under test; only the request headers and the rate limit are stood in for.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nf-client-connection-ip": "203.0.113.70" }) }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/rateLimit")>()), consumeRateLimit: async () => undefined }));

import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { changeSignupEmailAction, verifyEmailAction } from "@/app/(auth)/verify-email/actions";
import { resetPasswordAction } from "@/app/(auth)/reset-password/actions";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { BANNED_MESSAGE } from "@/lib/ban";
import { createSilentCode } from "@/lib/verification";
import { pendingSignupPayload, newSignupClaim } from "@/lib/pendingSignup";
import { newTag, prisma } from "./helpers";

const tag = newTag("mv");
const email = (n: string) => `${tag}-${n}@example.com`;
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: (c: Record<string, string>) => Promise<unknown> } }).options.authorize;

async function unconfirmed(name: string, password = "Mallory!pass1") {
  return prisma.user.create({ data: { email: email(name), name: "Mallory Smith", passwordHash: await bcrypt.hash(password, 4), emailCanonical: canonicalEmail(email(name)) } });
}

afterAll(async () => {
  await prisma.failedLoginAttempt.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.verificationCode.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.notification.deleteMany({ where: { user: { email: { startsWith: tag } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
});

describe("codes asked for before an unconfirmed account moved", () => {
  it("a password-reset code cannot reset the account, or sign in to it, at its new address", async () => {
    const mine = await unconfirmed("mine");
    const victim = email("victim");
    // The attacker asks for a reset code at their own address, then moves the account to the victim's address.
    const reset = await createSilentCode({ email: mine.email, userId: mine.id, purpose: "PASSWORD_RESET" });
    expect(await changeSignupEmailAction(mine.email, "Mallory!pass1", victim)).toMatchObject({ ok: true, email: victim });

    const result = await resetPasswordAction(mine.email, reset.code, "Attacker!new9");
    expect(result.ok).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: mine.id } });
    expect(row.email).toBe(victim);
    expect(await bcrypt.compare("Attacker!new9", row.passwordHash!)).toBe(false);
  });

  it("every open code for the account is closed by the move, whatever it was for", async () => {
    const mine = await unconfirmed("closed");
    await createSilentCode({ email: mine.email, userId: mine.id, purpose: "PASSWORD_RESET" });
    await createSilentCode({ email: mine.email, userId: mine.id, purpose: "LOGIN_2FA" });
    await changeSignupEmailAction(mine.email, "Mallory!pass1", email("closed-new"));
    // (the move itself sends one new EMAIL_VERIFY code to the new address; nothing else may be left open)
    const open = await prisma.verificationCode.findMany({ where: { userId: mine.id, consumedAt: null } });
    expect(open.map((c) => c.purpose)).toEqual(["EMAIL_VERIFY"]);
    expect(open[0].email).toBe(email("closed-new"));
  });

  it("the sign-in step refuses a code checked against an address the account has left", async () => {
    const mine = await unconfirmed("signin");
    await prisma.user.update({ where: { id: mine.id }, data: { emailVerified: new Date() } });
    const { code } = await createSilentCode({ email: mine.email, userId: mine.id, purpose: "LOGIN_2FA" });
    // Moved by some other route (Settings, an admin edit) while the code was still open.
    await prisma.user.update({ where: { id: mine.id }, data: { email: email("signin-new"), emailCanonical: canonicalEmail(email("signin-new")) } });
    expect(await authorize({ email: mine.email, code })).toBeNull();

    const fine = await createSilentCode({ email: email("signin-new"), userId: mine.id, purpose: "LOGIN_2FA" });
    expect(await authorize({ email: email("signin-new"), code: fine.code })).toMatchObject({ id: mine.id });
  });
});

describe("a banned account that never confirmed", () => {
  it("is not confirmed by a code, so lifting the ban later cannot leave it confirmed with whatever password it had", async () => {
    const mine = await unconfirmed("banned");
    await prisma.user.update({ where: { id: mine.id }, data: { bannedAt: new Date() } });
    const { claim, claimHash } = newSignupClaim();
    const { code } = await createSilentCode({
      email: mine.email,
      userId: mine.id,
      purpose: "EMAIL_VERIFY",
      payload: pendingSignupPayload({ name: "Mallory Smith", passwordHash: mine.passwordHash!, claimHash }),
    });
    expect(await verifyEmailAction(mine.email, code, claim)).toEqual({ ok: false, error: BANNED_MESSAGE });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: mine.id } });
    expect(row.emailVerified).toBeNull();
    expect(await bcrypt.compare("Mallory!pass1", row.passwordHash!)).toBe(true); // untouched, still unconfirmed
  });
});
