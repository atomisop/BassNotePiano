import { passwordRequirementError } from "@/lib/passwordRules";
import { reportError } from "@/lib/reportError";
import { attachReferral } from "@/lib/referrals";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { notifyAdmins } from "@/lib/adminNotifications";
import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, RateLimitError } from "@/lib/verification";
import { newSignupClaim, pendingSignupPayload } from "@/lib/pendingSignup";
import { isDisposableEmailDomain } from "@/lib/disposableEmail";
import { getBoolSetting, getTextSetting } from "@/lib/siteSettings";
import { assessPhone } from "@/lib/phoneValidity";
import { isPhoneConflict, isPhoneTaken, PHONE_TAKEN, phoneVerifyMode } from "@/lib/phoneVerification";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { verifyTurnstile } from "@/lib/turnstile";
import { FULL_NAME_MESSAGE, MAX_PERSON_NAME_LENGTH, cleanPersonName, hasFirstAndLastName } from "@/lib/studentName";
import { clientIpFrom, consumeRateLimit, RateLimitError as IpRateLimitError } from "@/lib/rateLimit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sign-up costs a bcrypt hash, a row, and an outbound email per call, so it
// is capped per IP before any of that runs.
const SIGNUP_LIMIT = { windowMinutes: 60, max: 10, message: "Too many sign-up attempts from this network. Try again in an hour." };

/** Said when this address has already been sent several codes in a row: the newest one is still good, so point at it. */
const TOO_MANY_CODES_MESSAGE =
  "We've already sent this address several codes. The newest one still works for a few minutes: check your inbox and the Promotions, Updates and Spam folders, or try again in about 15 minutes.";

export async function POST(req: NextRequest) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });

  const body = await req.json().catch(() => null);

  if (!(await getBoolSetting("signup.open"))) {
    return NextResponse.json({ error: await getTextSetting("signup.closedMessage") }, { status: 403 });
  }

  // Honeypot: a hidden field real visitors never fill. Answered with a fake
  // success so a bot gets no signal that it was caught.
  if (typeof body?.website === "string" && body.website.length > 0) {
    return NextResponse.json({ id: "ok", email: "" }, { status: 201 });
  }

  try {
    const ip = clientIpFrom(req.headers);
    await consumeRateLimit(prisma, `signup:${ip}`, SIGNUP_LIMIT);
    if (!(await verifyTurnstile(body?.turnstileToken, "signup", ip))) {
      return NextResponse.json({ error: "Please complete the human check and try again." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof IpRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }

  const name = typeof body?.name === "string" ? cleanPersonName(body.name) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if ((await getBoolSetting("signup.requireFullName")) && !hasFirstAndLastName(name)) {
    return NextResponse.json({ error: FULL_NAME_MESSAGE }, { status: 400 });
  }
  if (name.length > MAX_PERSON_NAME_LENGTH) return NextResponse.json({ error: "That name is too long." }, { status: 400 });
  if (!name || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a name and a valid email." }, { status: 400 });
  }
  // The same rules the sign-up screen shows while typing (src/lib/passwordRules.ts): enforced here, not only in the browser.
  const passwordError = passwordRequirementError(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  // Checked after the format check (a well-formed but disposable address),
  // before anything is written: the verification code, payment receipts,
  // and progress notifications this app sends all depend on the address
  // actually being reachable by the student long-term, and the family
  // bundle feature specifically depends on "an account" meaning a real,
  // ongoing person rather than a throwaway inbox nobody can be reached at.
  if ((await getBoolSetting("signup.blockDisposable")) && isDisposableEmailDomain(email)) {
    return NextResponse.json(
      { error: "That looks like a temporary or disposable email address. Please use one you can actually receive mail at." },
      { status: 400 },
    );
  }

  // A real-looking phone number is part of creating an account. With text confirmation off (the default) it is
  // kept as typed; with it on, it waits as pending until the 6-digit text is confirmed (phoneVerification.ts).
  const askPhone = await getBoolSetting("phone.askAtSignup");
  const verifying = await phoneVerifyMode();
  let phone: string | null = null;
  // Someone with no number of their own (a child in a family) may skip it; one number still belongs to one account.
  const skipPhone = body?.noPhone === true;
  if (askPhone && !skipPhone) {
    const assessed = assessPhone(typeof body?.phone === "string" ? body.phone : "");
    if (!assessed.ok) return NextResponse.json({ error: assessed.error }, { status: 400 });
    phone = assessed.phone;
    // One number, one account: it cannot be one an existing student already has.
    if (await isPhoneTaken(phone, null)) return NextResponse.json({ error: PHONE_TAKEN }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // Handed to THIS browser only; the code's payload holds just its hash (see pendingSignup.ts).
  const signup = newSignupClaim();

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        emailCanonical: canonicalEmail(email),
        passwordHash,
        // Confirming by text: keep it pending. Otherwise it is simply the number on file.
        ...(verifying ? { pendingPhone: phone, phoneRequired: phone !== null } : { phone }),
      },
      select: { id: true, email: true },
    });
    // The free trial does NOT start here. It starts when the email is confirmed (verifyEmailAction), so the clock never runs
    // while someone is still waiting for their code, and an inbox is only spent on an address that really belongs to them.
    // Came in through a friend's link: remember who (the reward waits for their first paid 3 or 6 month plan). Never blocks sign-up.
    if (body?.ref) await attachReferral(user.id, body.ref);
    // The account exists either way. If the email could not be sent the screen says so and offers "Resend", instead of
    // moving on to "enter your code" as if one were on its way.
    const sent = await createAndSendCode({
      email: user.email,
      userId: user.id,
      purpose: "EMAIL_VERIFY",
      payload: pendingSignupPayload({ name, passwordHash, claimHash: signup.claimHash }),
    });
    // Owner only (see ADMIN_NOTIFICATION_KINDS): who signed up, still unverified.
    // After the code goes out and never blocking: a failed alert must not leave
    // the account created but the person stuck without a code.
    await notifyAdmins("NEW_ACCOUNT", {
      type: "ADMIN_ALERT",
      title: "New account, not verified yet",
      body: `${name} (${user.email}) just created an account and has not verified their email yet. You will get another email when they do.`,
      emailCategory: "social",
      cta: { label: "View account", path: `/admin/users/${user.id}` },
    }).catch((err) => reportError(err, "New account alert failed"));
    return NextResponse.json({ ...user, emailSent: sent.ok, claim: signup.claim }, { status: 201 });
  } catch (err) {
    if (isPhoneConflict(err)) return NextResponse.json({ error: PHONE_TAKEN }, { status: 409 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // An account nobody has ever confirmed belongs to no one yet, so the person who really owns the inbox may register again and end
      // up with the password they chose. But typing someone else's address must never put a stranger's password on an account its
      // owner then confirms. So NOTHING on the account changes here: the new name and password wait inside the emailed code, and are
      // applied only when that code is entered by this same browser (the `claim` below, see pendingSignup.ts). If a stranger asks
      // for the code, the owner can still confirm the account, but the account keeps the password it already had.
      const existing = await prisma.user.findFirst({ where: { email, emailVerified: null }, select: { id: true, email: true } });
      if (existing) {
        // The new code is asked for FIRST and nothing else is written: when too many were already sent it throws, and the account is
        // left exactly as it was. This throw is raised inside this catch block, so the RateLimitError branch below never sees it:
        // it is answered here or it becomes a bare 500.
        let resent: { ok: boolean };
        try {
          resent = await createAndSendCode({
            email: existing.email,
            userId: existing.id,
            purpose: "EMAIL_VERIFY",
            payload: pendingSignupPayload({ name, passwordHash, claimHash: signup.claimHash }),
          });
        } catch (codeErr) {
          if (codeErr instanceof RateLimitError) return NextResponse.json({ error: TOO_MANY_CODES_MESSAGE }, { status: 429 });
          throw codeErr;
        }
        return NextResponse.json({ id: existing.id, email: existing.email, emailSent: resent.ok, claim: signup.claim }, { status: 201 });
      }
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
