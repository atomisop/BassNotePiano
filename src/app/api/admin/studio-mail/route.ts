import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEmployeeRecipients } from "@/lib/adminNotifications";
import { sendForwardedStudioMail } from "@/lib/email";

function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Receives emails sent to music@bassnotepiano.com from the owner's Gmail
 * script (scripts/gmail-payment-forwarder.gs) and copies them to every
 * employee the owner has switched "Emails sent to music@" on for. Server to
 * server with the same shared secret as the payment email route.
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
    // Claim the message first so a retry never sends a second copy.
    try {
      await prisma.forwardedMail.create({ data: { messageId: messageId.slice(0, 200) } });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") return NextResponse.json({ outcome: "duplicate" });
      throw err;
    }

    const employees = await getEmployeeRecipients("MUSIC_INBOX");
    await Promise.all(
      employees.map((employee) =>
        sendForwardedStudioMail(employee.email, {
          from: from.slice(0, 200),
          subject: subject.slice(0, 200) || "(no subject)",
          text: text.slice(0, 6000),
        }).catch((err) => console.error("Studio mail copy failed (non-blocking):", err)),
      ),
    );
    return NextResponse.json({ outcome: employees.length ? "forwarded" : "no recipients" });
  } catch (err) {
    console.error("Studio mail forward failed", err);
    return NextResponse.json({ error: "Could not process." }, { status: 500 });
  }
}
