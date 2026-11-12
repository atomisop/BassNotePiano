"use server";

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBoolSetting, getNumberSetting } from "@/lib/siteSettings";
import { verifyCode, createAndSendCode, createSilentCode, RateLimitError, type VerifyCodeResult } from "@/lib/verification";
import { sendWelcomeEmail } from "@/lib/email";
import { notifyAdmins } from "@/lib/adminNotifications";
import { withTimingFloor } from "@/lib/timingSafe";
import { phoneVerifyMode, resendPhoneCode } from "@/lib/phoneVerification";
import { startTrialForEmail } from "@/lib/entitlement";
import { reportError } from "@/lib/reportError";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { isDisposableEmailDomain } from "@/lib/disposableEmail";
import { clientIpFrom, consumeRateLimit, RateLimitError as IpRateLimitError } from "@/lib/rateLimit";

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find an active code for this email. Request a new one below.",
  expired: "That code has expired. Request a new one below.",
  too_many_attempts: "Too many incorrect attempts. Request a new code below.",
  incorrect: "That code isn't right. Double-check and try again.",
};

export async function verifyEmailAction(email: string, code: string) {
  const result: VerifyCodeResult = await verifyCode(email, "EMAIL_VERIFY", code);
  if (!result.ok) {
    return { ok: false as const, error: REASON_MESSAGES[result.reason] };
  }
  if (!result.userId) {
    return { ok: false as const, error: "Something went wrong. Request a new code." };
  }

  // The code was sent to ONE address, so only the account still sitting at that address is confirmed by it. An account that moved to
  // another address while the code was being checked (see changeSignupEmailAction) must not be confirmed by a code that went elsewhere.
  const user = await prisma.user
    .update({
      where: { id: result.userId, email: email.trim().toLowerCase() },
      data: { emailVerified: new Date() },
      select: { id: true, email: true, name: true, phoneRequired: true, phoneVerifiedAt: true },
    })
    .catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    });
  if (!user) return { ok: false as const, error: "Something went wrong. Request a new code." };

  // The free trial starts HERE, not at sign-up (changed 2026-11-12): a person who signs up on Friday and finds the code on Sunday
  // gets all of it, and the once-per-inbox marker is only spent on an address that really is theirs. Still one per person
  // (startTrialForEmail refuses an inbox that ever had one, and does nothing while the owner has trials switched off), and an
  // account made before this change that already has a trial keeps the one it has. Best-effort: never blocks verifying.
  await startTrialForEmail(user.email).catch((err) => reportError(err, "Starting the free trial failed"));

  // Owner only: the account they were told about as "not verified yet" now is.
  await notifyAdmins("ACCOUNT_VERIFIED", {
    type: "ADMIN_ALERT",
    title: "New user verified their account",
    body: `${user.name ?? user.email} (${user.email}) verified their email.`,
    emailCategory: "social",
    cta: { label: "View account", path: `/admin/users/${user.id}` },
  });

  // First real proof the account is fully created, a one-time welcome
  // email, not routed through the notification-preference system since
  // there's no in-app equivalent and no opt-out that would make sense here.
  // Non-blocking: a failed welcome email should never stop verification
  // from succeeding.
  sendWelcomeEmail(user.email, user.name).catch((err) => console.error("Welcome email failed (non-blocking):", err));

  // Verifying the email is itself proof enough to log in immediately,
  // issue a fresh LOGIN_2FA code silently (never emailed) so the client can
  // turn around and sign in with it in the same flow, no second code needed.
  // Rate-limiting this specific call would only trip on repeated verify+
  // auto-login cycles for one address in a short window, an edge case, but
  // still handled rather than left to crash.
  try {
    const { code: autoCode } = await createSilentCode({ email: user.email, userId: user.id, purpose: "LOGIN_2FA" });
    // An account made while a phone number was required still has to confirm it. The text goes out now, so the
    // next screen can ask for the code straight away. If it cannot be sent, that screen offers to try again.
    const needsPhone = user.phoneRequired && !user.phoneVerifiedAt && (await phoneVerifyMode());
    const phoneCodeSent = needsPhone ? (await resendPhoneCode(user.id).catch(() => ({ ok: false as const }))).ok : false;
    return { ok: true as const, autoCode, needsPhone, phoneCodeSent };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false as const, error: err.message };
    throw err;
  }
}

/** Nothing to resend if already verified, and an unknown address answers the same as a known one. A person who has asked for
 *  several codes in a row IS told to wait: staying silent here once made the button say "sent" while nothing was sent, and
 *  the sign-up screen already says plainly when an address has an account, so this reveals nothing new.
 *  Wrapped in withTimingFloor so the answer takes the same time either way, see requestPasswordResetAction. */
export async function resendVerificationEmailAction(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return withTimingFloor(async () => {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.emailVerified) return { ok: true as const };
    try {
      const sent = await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
      // A failed send is about the email service, not about this account, so it is safe to say so.
      if (!sent.ok) return { ok: false as const, error: "We couldn't send the email just now. Please try again in a minute." };
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
      const minutes = await getNumberSetting("security.codeIssueWindowMinutes");
      return {
        ok: false as const,
        error: `You've asked for several codes in a row, so new ones are paused for about ${minutes} minutes. The newest one we sent still works for a few minutes: check your inbox, and the Promotions, Updates and Spam folders.`,
      };
    }
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// "Wrong email?": fix a typo in the address while the account is still waiting for its first code.
// ---------------------------------------------------------------------------

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One answer for every way this can fail on the account side (no such account, already confirmed, banned, wrong password), so it cannot be used to probe which emails are registered. */
const EMAIL_CHANGE_FAILED = "We couldn't change the email. Check your password, or log in if you already confirmed your address.";
const EMAIL_IN_USE = "That address already has an account. Log in with it, or use a different one.";

/** Thrown inside the move's transaction to roll it back when the account stopped being an unconfirmed one mid-request. */
class AccountNoLongerMovable extends Error {}

export type ChangeSignupEmailResult = { ok: true; email: string; emailSent: boolean } | { ok: false; error: string };

/**
 * Moves a not-yet-confirmed account to a corrected email and sends the code there. The password just chosen at sign-up is the proof
 * it is the same person (nothing else identifies an unconfirmed account), checked server-side on every call. Only an account that has
 * never been confirmed can be changed this way; a confirmed one changes its email from Settings, with the usual code. The old
 * address's open codes are closed so a code mailed to the typo can no longer confirm anything. Rate limited per old address and per
 * network, because each call is a password guess.
 */
export async function changeSignupEmailAction(oldEmail: string, password: string, newEmail: string): Promise<ChangeSignupEmailResult> {
  return withTimingFloor(async () => {
    // Capped before anything is built from them (a rate-limit key included): no real address is longer than 254 characters.
    const from = typeof oldEmail === "string" ? oldEmail.trim().toLowerCase().slice(0, 255) : "";
    const to = typeof newEmail === "string" ? newEmail.trim().toLowerCase().slice(0, 255) : "";

    try {
      const ip = clientIpFrom(await headers());
      await consumeRateLimit(prisma, `signup-email-change:${from}`, { windowMinutes: 60, max: 6, message: "Too many tries. Wait a while and try again." });
      await consumeRateLimit(prisma, `signup-email-change-ip:${ip}`, { windowMinutes: 60, max: 20, message: "Too many tries from this network. Wait a while and try again." });
    } catch (err) {
      if (err instanceof IpRateLimitError) return { ok: false as const, error: err.message };
      throw err;
    }

    // Nothing here depends on the account, so none of it says anything about who is registered.
    if (!to || to.length > 254 || !EMAIL_SHAPE.test(to)) return { ok: false as const, error: "Enter a valid email address." };
    if (to === from) return { ok: false as const, error: "That is the address the code already went to. Enter the corrected one." };
    if ((await getBoolSetting("signup.blockDisposable")) && isDisposableEmailDomain(to)) {
      return { ok: false as const, error: "That looks like a temporary or disposable email address. Please use one you can actually receive mail at." };
    }

    const user = await prisma.user.findUnique({ where: { email: from }, select: { id: true, email: true, passwordHash: true, emailVerified: true, bannedAt: true } });
    const passwordOk = typeof password === "string" && password.length > 0 && password.length <= 200 && !!user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordOk || user.emailVerified || user.bannedAt) return { ok: false as const, error: EMAIL_CHANGE_FAILED };

    const taken = await prisma.user.findUnique({ where: { email: to }, select: { id: true } });
    if (taken) return { ok: false as const, error: EMAIL_IN_USE };

    try {
      await prisma.$transaction(async (tx) => {
        // The write states what it relies on. The checks above ran before a slow password comparison, so by now the account may have
        // been confirmed (its code entered in another tab) or banned; moving an account that has just been confirmed would hand a
        // CONFIRMED account to an address nobody has proved they own. Zero rows means one of those happened, and nothing is written.
        const moved = await tx.user.updateMany({
          where: { id: user.id, email: from, emailVerified: null, bannedAt: null },
          data: { email: to, emailCanonical: canonicalEmail(to) },
        });
        if (moved.count !== 1) throw new AccountNoLongerMovable();
        await tx.verificationCode.updateMany({ where: { email: from, purpose: "EMAIL_VERIFY", consumedAt: null }, data: { consumedAt: new Date() } });
      });
    } catch (err) {
      if (err instanceof AccountNoLongerMovable) return { ok: false as const, error: EMAIL_CHANGE_FAILED };
      // Someone else took the address between the check and the write: the unique index lets one win.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false as const, error: EMAIL_IN_USE };
      throw err;
    }

    try {
      const sent = await createAndSendCode({ email: to, userId: user.id, purpose: "EMAIL_VERIFY" });
      return { ok: true as const, email: to, emailSent: sent.ok };
    } catch (err) {
      // The address is already changed; the screen offers Resend, which explains the wait.
      if (err instanceof RateLimitError) return { ok: true as const, email: to, emailSent: false };
      throw err;
    }
  });
}
