import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/reportError";
import { nextEmailStatus, statusFromResendEvent, verifyResendSignature } from "@/lib/emailLogRules";
import { notifyAdmins } from "@/lib/adminNotifications";

export const dynamic = "force-dynamic";

/**
 * Resend's webhook: tells us what happened to an email after it left (delivered, opened, a link clicked, bounced, marked as spam,
 * delayed), so Admin > Inbox > Sent can show it. Set up in the Resend dashboard (Webhooks > Add endpoint, this address, those email
 * events); its signing secret goes in RESEND_WEBHOOK_SECRET. Nothing is trusted until the signature checks out.
 *
 * Resend retries on anything but a 2xx, so an event we do not track, or one for an email we have no record of, is answered 200.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const body = await req.text();
  const ok = verifyResendSignature(
    secret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    body,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature." }, { status: 401 });

  let event: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const status = typeof event.type === "string" ? statusFromResendEvent(event.type) : null;
  const resendId = typeof event.data?.email_id === "string" ? event.data.email_id.slice(0, 100) : null;
  if (!status || !resendId) return NextResponse.json({ ok: true });

  try {
    const log = await prisma.emailLog.findUnique({ where: { resendId }, select: { id: true, status: true, deliveredAt: true, openedAt: true, bouncedAt: true, userId: true, to: true, subject: true } });
    if (!log) return NextResponse.json({ ok: true });
    const at = typeof event.created_at === "string" && !Number.isNaN(Date.parse(event.created_at)) ? new Date(event.created_at) : new Date();
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: nextEmailStatus(log.status, status),
        ...(status === "DELIVERED" && !log.deliveredAt ? { deliveredAt: at } : {}),
        ...((status === "OPENED" || status === "CLICKED") && !log.openedAt ? { openedAt: at } : {}),
        ...((status === "BOUNCED" || status === "COMPLAINED") && !log.bouncedAt ? { bouncedAt: at } : {}),
      },
    });
    // A bounce to a student is almost always a mistyped address (a live one was "gnail.com", 2026-11-02): tell the studio once per
    // email, with where to fix it, instead of letting every later email to that address silently bounce too.
    if (status === "BOUNCED" && !log.bouncedAt && log.userId) {
      await notifyAdmins("EMAIL_BOUNCED", {
        type: "ADMIN_ALERT",
        title: "An email to a student bounced",
        body: `The email \u201c${log.subject}\u201d to ${log.to} could not be delivered. The address may be mistyped: check it on their account and ask them for the right one.`,
        cta: { label: "Open account", path: `/admin/users/${log.userId}` },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError(err, "resend webhook");
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
}
