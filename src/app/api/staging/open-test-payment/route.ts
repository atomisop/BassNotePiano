import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { isStaging } from "@/lib/appEnv";
import { prisma } from "@/lib/prisma";
import { paymentReferenceCode } from "@/lib/paymentReference";

/** The one gate for both handlers: only a staging deploy, only with the shared token (compared in constant time). Everyone else gets a 404. */
function smokeCallerAllowed(request: Request): boolean {
  const expected = process.env.STAGING_SMOKE_TOKEN;
  const given = request.headers.get("x-smoke-token") ?? "";
  return isStaging() && Boolean(expected) && expected!.length >= 16 && given.length === expected!.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected!));
}

/**
 * STAGING ONLY. The smoke checks call this to get a fresh unpaid payment (and its BNP code) for the seeded test student, then send a
 * test bank email for it. Returns 404 everywhere else (production never answers it) and needs the shared STAGING_SMOKE_TOKEN.
 */
export async function POST(request: Request) {
  if (!smokeCallerAllowed(request)) return new NextResponse(null, { status: 404 });

  const student = await prisma.user.findUnique({ where: { email: process.env.STAGING_STUDENT_EMAIL ?? "student@bnp-test.local" }, select: { id: true } });
  if (!student) return NextResponse.json({ error: "The test student is missing. Run the staging seed." }, { status: 409 });
  // A unique amount per call, so one test email can only ever match its own payment.
  const amountCents = (1000 + Math.floor(Math.random() * 8000)) * 100 + 99;
  const payment = await prisma.zellePayment.create({
    data: { userId: student.id, purpose: "CLASS_CREDITS", lessonQuantity: 2, amountCents, zelleHandle: "staging@bnp-test.local", status: "AWAITING_TRANSFER" },
  });
  return NextResponse.json({ paymentId: payment.id, code: paymentReferenceCode(payment.id), amountCents, status: payment.status });
}

/** Read back a payment's status and whether it is waiting in the unchecked list (the smoke checks assert on this). */
export async function GET(request: Request) {
  if (!smokeCallerAllowed(request)) return new NextResponse(null, { status: 404 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const p = await prisma.zellePayment.findUnique({ where: { id }, select: { status: true, autoApproved: true, checkedAt: true, note: true } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ status: p.status, autoApproved: p.autoApproved, unchecked: p.autoApproved && p.checkedAt === null, note: p.note });
}
