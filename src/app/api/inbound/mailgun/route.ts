import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { ingestInboundEmail } from "@/lib/support";
import { reportError } from "@/lib/reportError";
import { recordProbeReceived } from "@/lib/mailProbe";
import {
  isAutomatedMail,
  isSenderAuthenticated,
  isStudioRecipient,
  parseMessageHeaders,
  parseMessageIds,
  parseProbeToken,
  parseSender,
  verifyMailgunSignature,
} from "@/lib/inboundEmail";

export const dynamic = "force-dynamic";

// One address cannot flood the Email tab, and nor can everyone at once.
const PER_SENDER_LIMIT = { windowMinutes: 60, max: 20 };
const OVERALL_LIMIT = { windowMinutes: 60, max: 300 };

/**
 * Receives email sent to the studio inbox. The domain's own mail is handled by
 * Squarespace's forwarding, so a copy of each music@ message is forwarded to
 * music@inbox.bassnotepiano.com, a subdomain on the owner's own Mailgun
 * account, whose route (Receiving > Routes) posts it here. Nothing is trusted
 * until Mailgun's signature checks out against MAILGUN_SIGNING_KEY.
 *
 * Mailgun retries on any answer other than 200 or 406, so a message we choose
 * not to keep (automated mail, over a limit, not for music@) is answered 200.
 * A genuine failure answers 500 and is retried.
 */
export async function POST(req: Request) {
  const signingKey = process.env.MAILGUN_SIGNING_KEY;
  if (!signingKey) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const field = (name: string): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  const verified = verifyMailgunSignature({
    signingKey,
    timestamp: field("timestamp"),
    token: field("token"),
    signature: field("signature"),
  });
  if (!verified) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  if (!isStudioRecipient(field("recipient"))) {
    return NextResponse.json({ outcome: "ignored", reason: "not for the studio inbox" });
  }

  // The daily test email proves the whole chain works. It is recorded and never becomes a thread.
  const probeToken = parseProbeToken(field("subject"));
  if (probeToken) {
    try {
      const known = await recordProbeReceived(probeToken);
      return NextResponse.json({ outcome: known ? "probe" : "ignored" });
    } catch (err) {
      reportError(err, "Inbound mail test");
      return NextResponse.json({ error: "Could not process." }, { status: 500 });
    }
  }

  const headers = parseMessageHeaders(field("message-headers"));
  const sender = parseSender(field("from") || field("sender"));
  if (!sender) return NextResponse.json({ outcome: "ignored", reason: "no usable sender" });
  if (isAutomatedMail(headers, sender.email)) return NextResponse.json({ outcome: "ignored", reason: "automated mail" });

  try {
    await consumeRateLimit(prisma, `inbound-email:${sender.email}`, PER_SENDER_LIMIT);
    await consumeRateLimit(prisma, "inbound-email:all", OVERALL_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error(`Inbound email over its limit, dropped: ${sender.email}`);
      return NextResponse.json({ outcome: "ignored", reason: "rate limited" });
    }
    reportError(err, "Inbound email rate limit check");
    return NextResponse.json({ error: "Could not process." }, { status: 500 });
  }

  try {
    const result = await ingestInboundEmail({
      messageId: parseMessageIds(headers.get("message-id") ?? field("Message-Id"))[0] ?? null,
      fromEmail: sender.email,
      fromName: sender.name,
      senderVerified: isSenderAuthenticated(headers),
      subject: field("subject"),
      // "stripped-text" is the new part of a reply without the quoted history.
      text: field("stripped-text") || field("body-plain"),
      parentMessageIds: parseMessageIds(
        headers.get("in-reply-to") ?? field("In-Reply-To"),
        headers.get("references") ?? field("References"),
      ),
      attachmentCount: Number.parseInt(field("attachment-count"), 10) || 0,
    });
    return NextResponse.json({ outcome: result.outcome });
  } catch (err) {
    reportError(err, "Inbound email");
    return NextResponse.json({ error: "Could not process." }, { status: 500 });
  }
}
