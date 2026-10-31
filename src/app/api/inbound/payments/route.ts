import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { ingestInboundEmail } from "@/lib/support";
import { reportError } from "@/lib/reportError";
import { ingestPaymentEmail, isAllowedSender, holdUnverifiedPaymentEmail } from "@/lib/paymentEmail";
import { checkForwardedBankMail, emailBodyText, isPaymentInboxRecipient, normalizeMessageId } from "@/lib/paymentInbound";
import { isAutomatedMail, parseMessageHeaders, parseMessageIds, parseSender, verifyMailgunSignature } from "@/lib/inboundEmail";

export const dynamic = "force-dynamic";

const GOOGLE_FORWARDING_SENDER = "forwarding-noreply@google.com";
const OVERALL_LIMIT = { windowMinutes: 60, max: 200 };

/**
 * Receives bank, Zelle and Venmo emails the owner's Gmail forwards to a private address on the Mailgun inbox
 * (pay-<PAYMENT_INBOX_TOKEN>@inbox.bassnotepiano.com), so each payment is handled the moment its email arrives instead of
 * being polled for. Four things stand between a stranger and an approved payment: the private address, Mailgun's request
 * signature, the sender being a known bank domain, and the bank's own DKIM signature on the email (see
 * checkForwardedBankMail). The money rules (exact amount, code or name) are the same as for the Gmail script.
 *
 * Mailgun retries on any answer other than 200 or 406, so mail we choose not to use is answered 200 and a genuine failure 500.
 */
export async function POST(req: Request) {
  const signingKey = process.env.MAILGUN_SIGNING_KEY;
  const token = process.env.PAYMENT_INBOX_TOKEN;
  if (!signingKey || !token || token.length < 16) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const field = (name: string): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  if (!verifyMailgunSignature({ signingKey, timestamp: field("timestamp"), token: field("token"), signature: field("signature") })) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isPaymentInboxRecipient(field("recipient"), token)) return NextResponse.json({ outcome: "ignored", reason: "not for the payments address" });

  const rawHeaders = field("message-headers");
  const headers = parseMessageHeaders(rawHeaders);
  const sender = parseSender(field("from") || field("sender"));
  if (!sender) return NextResponse.json({ outcome: "ignored", reason: "no usable sender" });

  try {
    await consumeRateLimit(prisma, "inbound-payments:all", OVERALL_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ outcome: "ignored", reason: "rate limited" });
    reportError(err, "Inbound payment email rate limit check");
    return NextResponse.json({ error: "Could not process." }, { status: 500 });
  }

  try {
    // Gmail asks for a confirmation code when the forwarding address is first added. Show it in the studio Email tab.
    if (sender.email === GOOGLE_FORWARDING_SENDER) {
      const result = await ingestInboundEmail({
        messageId: parseMessageIds(headers.get("message-id") ?? field("Message-Id"))[0] ?? null,
        fromEmail: sender.email,
        fromName: sender.name,
        senderVerified: false,
        subject: field("subject"),
        text: field("body-plain"),
        parentMessageIds: [],
        attachmentCount: 0,
      });
      return NextResponse.json({ outcome: result.outcome });
    }

    if (isAutomatedMail(headers, sender.email) && !isAllowedSender(field("from"))) return NextResponse.json({ outcome: "ignored", reason: "automated mail" });
    if (!isAllowedSender(field("from"))) return NextResponse.json({ outcome: "ignored", reason: "not a bank sender" });

    const messageId = normalizeMessageId(headers.get("message-id") ?? field("Message-Id"));
    if (!messageId) return NextResponse.json({ outcome: "ignored", reason: "no message id" });

    // The verdict is normally a message header; some routes post it as a form field instead.
    const dkimResult = headers.get("x-mailgun-dkim-check-result") ?? (field("X-Mailgun-Dkim-Check-Result") || field("x-mailgun-dkim-check-result") || undefined);
    const check = checkForwardedBankMail({ fromEmail: sender.email, dkimResult, rawHeaders });
    if (!check.ok && check.soft) {
      // No verdict from Mailgun, but the bank's own signature is on the message and Gmail saw it pass: read it like a verified email, and leave
      // whatever it settles in the owner's "unchecked" list.
      const outcome = await ingestPaymentEmail(
        { messageId, from: field("from"), subject: field("subject").slice(0, 300), body: emailBodyText(field("body-plain"), field("body-html")).slice(0, 6000) },
        { forceCheck: true },
      );
      return NextResponse.json({ outcome });
    }
    if (!check.ok) {
      // Not trusted to approve anything, but still read: a payment whose code and exact amount it carries is put in front of the owner.
      const outcome = await holdUnverifiedPaymentEmail({
        messageId,
        from: field("from"),
        subject: field("subject").slice(0, 300),
        body: emailBodyText(field("body-plain"), field("body-html")).slice(0, 6000),
        reason: `${check.reason ?? "its sender check failed"}${check.gmailSawBankSignature ? ". Gmail recorded that the bank's own signature passed, so forwarding probably broke the check" : ""}`,
      });
      return NextResponse.json({ outcome });
    }

    const outcome = await ingestPaymentEmail({
      messageId,
      from: field("from"),
      subject: field("subject").slice(0, 300),
      body: emailBodyText(field("body-plain"), field("body-html")).slice(0, 6000),
    });
    return NextResponse.json({ outcome });
  } catch (err) {
    reportError(err, "Inbound payment email");
    return NextResponse.json({ error: "Could not process." }, { status: 500 });
  }
}
