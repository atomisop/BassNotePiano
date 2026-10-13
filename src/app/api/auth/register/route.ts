import { passwordRequirementError } from "@/lib/passwordRules";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { notifyAdmins } from "@/lib/adminNotifications";
import { hasApprovedRegistration, startTrialForEmail } from "@/lib/entitlement";
import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, RateLimitError } from "@/lib/verification";
import { isDisposableEmailDomain } from "@/lib/disposableEmail";
import { getBoolSetting, getTextSetting } from "@/lib/siteSettings";
import { assessPhone } from "@/lib/phoneValidity";
import { isPhoneConflict, isPhoneTaken, PHONE_TAKEN, phoneVerifyMode } from "@/lib/phoneVerification";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { verifyTurnstile } from "@/lib/turnstile";
import { FULL_NAME_MESSAGE, hasFirstAndLastName } from "@/lib/studentName";
import { clientIpFrom, consumeRateLimit, RateLimitError as IpRateLimitError } from "@/lib/rateLimit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sign-up costs a bcrypt hash, a row, and an outbound email per call, so it
// is capped per IP before any of that runs.
const SIGNUP_LIMIT = { windowMinutes: 60, max: 10, message: "Too many sign-up attempts from this network. Try again in an hour." };

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

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if ((await getBoolSetting("signup.requireFullName")) && !hasFirstAndLastName(name)) {
    return NextResponse.json({ error: FULL_NAME_MESSAGE }, { status: 400 });
  }
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
  if (askPhone) {
    const assessed = assessPhone(typeof body?.phone === "string" ? body.phone : "");
    if (!assessed.ok) return NextResponse.json({ error: assessed.error }, { status: 400 });
    phone = assessed.phone;
    // One number, one account: it cannot be one an existing student already has.
    if (await isPhoneTaken(phone, null)) return NextResponse.json({ error: PHONE_TAKEN }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

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
    // Someone approved for classes before they made an account gets their
    // free trial now. Best-effort, never blocks sign-up.
    if (await hasApprovedRegistration(user.email).catch(() => false)) {
      await startTrialForEmail(user.email).catch((err) => console.error("Starting the free trial failed (non-blocking):", err));
    }
    await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    // Owner only (see ADMIN_NOTIFICATION_KINDS): who signed up, still unverified.
    // After the code goes out and never blocking: a failed alert must not leave
    // the account created but the person stuck without a code.
    await notifyAdmins("NEW_ACCOUNT", {
      type: "ADMIN_ALERT",
      title: "New account, not verified yet",
      body: `${name} (${user.email}) just created an account and has not verified their email yet. You will get another email when they do.`,
      emailCategory: "social",
      cta: { label: "View account", path: `/admin/users/${user.id}` },
    }).catch((err) => console.error("New account alert failed (non-blocking):", err));
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (isPhoneConflict(err)) return NextResponse.json({ error: PHONE_TAKEN }, { status: 409 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
