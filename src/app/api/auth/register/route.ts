import { hasApprovedRegistration, startTrialForEmail } from "@/lib/entitlement";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAndSendCode, RateLimitError } from "@/lib/verification";
import { isDisposableEmailDomain } from "@/lib/disposableEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !EMAIL_PATTERN.test(email) || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Enter a name, a valid email, and a password of at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  // Checked after the format check (a well-formed but disposable address),
  // before anything is written: the verification code, payment receipts,
  // and progress notifications this app sends all depend on the address
  // actually being reachable by the student long-term, and the family
  // bundle feature specifically depends on "an account" meaning a real,
  // ongoing person rather than a throwaway inbox nobody can be reached at.
  if (isDisposableEmailDomain(email)) {
    return NextResponse.json(
      { error: "That looks like a temporary or disposable email address. Please use one you can actually receive mail at." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, email: true },
    });
    // Someone approved for classes before they made an account gets their
    // free trial now. Best-effort, never blocks sign-up.
    if (await hasApprovedRegistration(user.email).catch(() => false)) {
      await startTrialForEmail(user.email).catch((err) => console.error("Starting the free trial failed (non-blocking):", err));
    }
    await createAndSendCode({ email: user.email, userId: user.id, purpose: "EMAIL_VERIFY" });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
