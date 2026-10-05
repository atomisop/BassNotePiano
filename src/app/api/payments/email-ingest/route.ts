import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { ingestPaymentEmail } from "@/lib/paymentEmail";

function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Receives "you received money" emails from the owner's Gmail script
 * (scripts/gmail-payment-forwarder.gs). Not a browser route: it is called
 * server to server with a shared secret, so there is no session or origin to
 * check. Without PAYMENT_EMAIL_SECRET set it stays off.
 */
export async function POST(req: Request) {
  const expected = process.env.PAYMENT_EMAIL_SECRET;
  if (!expected || expected.length < 24) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!secretMatches(req.headers.get("x-ingest-secret") ?? "", expected)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { messageId, from, subject, body: text } = body ?? {};
  if (![messageId, from, subject, text].every((value) => typeof value === "string") || !messageId) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  try {
    const outcome = await ingestPaymentEmail({
      messageId,
      from,
      subject: subject.slice(0, 300),
      body: text.slice(0, 6000),
    });
    return NextResponse.json({ outcome });
  } catch (err) {
    console.error("Payment email ingest failed", err);
    return NextResponse.json({ error: "Could not process." }, { status: 500 });
  }
}
