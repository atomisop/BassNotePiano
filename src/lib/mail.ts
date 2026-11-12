import type { MailKind, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppUrl, sendPersonalEmail } from "@/lib/email";

export class MailError extends Error {}

/**
 * Notification types that are serious, per-person notices. They go to the
 * student's Mail inbox instead of the bell, so a payment notice or a billing
 * reminder never sinks under everyday notifications.
 */
export const MAIL_ROUTED_TYPES: Partial<Record<NotificationType, MailKind>> = {
  PAYMENT_APPROVED: "PAYMENT",
  PAYMENT_REJECTED: "PAYMENT",
  PAYMENT_RECEIVED: "PAYMENT",
  PAYMENT_PLAN_UPDATED: "BILLING",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT",
  PAYMENT_PLAN_INSTALLMENT_DUE: "BILLING",
  PAYMENT_PLAN_INSTALLMENT_OVERDUE: "BILLING",
  PAYMENT_PLAN_COMPLETED: "BILLING",
  PAYMENT_PLAN_CANCELED: "BILLING",
  CREDIT_ADJUSTED: "BILLING",
  CREDITS_EXPIRED: "BILLING",
  CREDITS_EXPIRING_SOON: "BILLING",
};

const MAX_TITLE = 120;
const MAX_BODY = 2000;

/** Stores one message in a person's Mail. Used by createNotification for payment and billing notices. */
export async function createMailMessage(input: {
  userId: string;
  kind: MailKind;
  title: string;
  body: string;
  actionLabel?: string | null;
  actionHref?: string | null;
  supportCta?: boolean;
  sentById?: string | null;
}) {
  return prisma.mailMessage.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title.slice(0, MAX_TITLE),
      body: input.body.slice(0, MAX_BODY),
      actionLabel: input.actionLabel ?? null,
      actionHref: input.actionHref ?? null,
      supportCta: input.supportCta ?? false,
      sentById: input.sentById ?? null,
    },
  });
}

export interface SendAdminMessageResult {
  mailId: string;
  /** "sent", or why no email went out. */
  email: "sent" | "off" | "opted-out" | "failed";
}

/**
 * An admin writes to one student. It lands in their Mail, shows up in the bell
 * as a pointer to it, and (optionally) goes out by email, respecting the
 * student's own email preference for messages. With supportCta the message,
 * the bell entry and the email each offer "Click here to contact support".
 */
export async function sendAdminMessage(
  adminId: string,
  recipientId: string,
  titleInput: string,
  bodyInput: string,
  options: { sendEmail: boolean; supportCta: boolean },
): Promise<SendAdminMessageResult> {
  const title = titleInput.trim();
  const body = bodyInput.trim();
  if (!title) throw new MailError("Title can't be empty.");
  if (!body) throw new MailError("Message can't be empty.");
  if (title.length > MAX_TITLE) throw new MailError(`Title is too long (${MAX_TITLE} characters max).`);
  if (body.length > MAX_BODY) throw new MailError(`Message is too long (${MAX_BODY} characters max).`);

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, email: true, name: true, notifyEmailSocial: true, bannedAt: true },
  });
  if (!recipient) throw new MailError("That person doesn't exist.");

  const mail = await createMailMessage({ userId: recipient.id, kind: "ADMIN_MESSAGE", title, body, supportCta: options.supportCta, sentById: adminId });

  // The bell entry is only a pointer: the real message is in Mail.
  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: "MAIL_MESSAGE",
      title: "New message from Bass Note Piano",
      body: options.supportCta ? `${title}. Click here to contact support.` : title,
      href: `/mail/${mail.id}`,
    },
  });

  let email: SendAdminMessageResult["email"] = "off";
  if (options.sendEmail) {
    if (recipient.bannedAt) {
      email = "off"; // a banned account is sent nothing
    } else if (!recipient.notifyEmailSocial) {
      email = "opted-out";
    } else {
      try {
        const firstName = recipient.name?.trim().split(/\s+/)[0];
        await sendPersonalEmail(recipient.email, title, body, {
          firstName,
          link: options.supportCta ? { label: "Click here to contact support", url: getAppUrl(`/mail/${mail.id}`) } : undefined,
          unsubscribe: { userId: recipient.id, category: "social" },
        });
        email = "sent";
      } catch (err) {
        console.error("Admin message email failed (non-blocking):", err);
        email = "failed";
      }
    }
  }
  return { mailId: mail.id, email };
}

export async function getMailUnreadCount(userId: string): Promise<number> {
  return prisma.mailMessage.count({ where: { userId, readAt: null } });
}

export async function listMail(userId: string, limit = 100) {
  return prisma.mailMessage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
}

/** One message, opened by its owner: marks it read. */
export async function openMail(userId: string, mailId: string) {
  const mail = await prisma.mailMessage.findFirst({ where: { id: mailId, userId } });
  if (!mail) return null;
  if (!mail.readAt) {
    await prisma.mailMessage.update({ where: { id: mail.id }, data: { readAt: new Date() } });
  }
  return mail;
}

export async function markAllMailRead(userId: string): Promise<void> {
  await prisma.mailMessage.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

/**
 * The student taps "Contact support" on a message: opens a case in Support
 * Chat (every admin who has Support Chat switched on is notified), seeded with
 * the message so the team has the context. Calling it again returns the same
 * case while it is still open.
 */
export async function openSupportCaseFromMail(userId: string, mailId: string): Promise<{ escalationId: string }> {
  const mail = await prisma.mailMessage.findFirst({ where: { id: mailId, userId } });
  if (!mail) throw new MailError("That message doesn't exist.");

  if (mail.supportCaseId) {
    const existing = await prisma.assistantEscalation.findUnique({ where: { id: mail.supportCaseId }, select: { id: true, status: true } });
    if (existing && existing.status === "OPEN") return { escalationId: existing.id };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user) throw new MailError("Account not found.");

  // Loaded here, not at the top: support.ts pulls in the NextAuth session helper, which only
  // loads inside Next. Importing it at module level would break the scheduled Netlify
  // functions, since they reach this file through notifications.ts.
  const { createAssistantEscalation, AssistantEscalationError } = await import("@/lib/support");
  try {
    const escalation = await createAssistantEscalation({
      identifier: `user:${userId}`,
      userId,
      contactName: user.name,
      contactEmail: user.email,
      transcript: [
        { role: "assistant", content: `${mail.title}\n\n${mail.body}` },
        { role: "user", content: "I'd like to talk to the team about this message." },
      ],
    });
    await prisma.mailMessage.update({ where: { id: mail.id }, data: { supportCaseId: escalation.id, readAt: mail.readAt ?? new Date() } });
    return { escalationId: escalation.id };
  } catch (err) {
    if (err instanceof AssistantEscalationError) throw new MailError(err.message);
    throw err;
  }
}

export interface SentAdminMessageRow {
  id: string;
  title: string;
  recipientName: string | null;
  recipientEmail: string;
  body: string;
  supportCta: boolean;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  /** The student answered: their reply opened this Support Chat case (openSupportCaseFromMail). */
  supportCaseId: string | null;
}

export async function listSentAdminMessages(limit = 30): Promise<SentAdminMessageRow[]> {
  const rows = await prisma.mailMessage.findMany({
    where: { kind: "ADMIN_MESSAGE" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
  // A support case can be deleted for good; only link to the ones still there.
  const caseIds = rows.map((r) => r.supportCaseId).filter((id): id is string => !!id);
  const liveCases = caseIds.length
    ? new Set((await prisma.assistantEscalation.findMany({ where: { id: { in: caseIds } }, select: { id: true } })).map((c) => c.id))
    : new Set<string>();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    recipientName: r.user.name,
    recipientEmail: r.user.email,
    body: r.body,
    supportCta: r.supportCta,
    readAt: r.readAt,
    read: !!r.readAt,
    createdAt: r.createdAt,
    supportCaseId: r.supportCaseId && liveCases.has(r.supportCaseId) ? r.supportCaseId : null,
  }));
}
