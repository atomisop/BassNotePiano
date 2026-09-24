import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, sendNotificationEmailWithCta, getAppUrl } from "@/lib/email";

type EmailCategory = "payments" | "roleUpdates" | "social" | "reminders";
type EmailKind = "default" | "notice";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** If set, also emails the user provided their matching notifyEmail* preference is on. */
  emailCategory?: EmailCategory;
}

interface NotificationCta {
  label: string;
  url: string;
  kind: EmailKind;
}

// One deep-link per notification type, so the emailed version of a
// notification always lands you exactly where the in-app bell would —
// never just a generic "open the app" link. NEW_MESSAGE isn't here: it
// never goes through createNotification (see the comment below), so its
// CTA ("Click here to reply", deep-linked to the actual sender) is built
// by the caller in messages.ts/groupMessages.ts instead, where the
// senderId is actually known.
const NOTIFICATION_CTA: Partial<Record<NotificationType, NotificationCta>> = {
  PAYMENT_APPROVED: { label: "View your purchase", url: getAppUrl("/billing/history"), kind: "default" },
  PAYMENT_REJECTED: { label: "Review & resubmit", url: getAppUrl("/billing/history"), kind: "notice" },
  ROLE_UPDATED: { label: "Go to admin panel", url: getAppUrl("/admin"), kind: "default" },
  FRIEND_REQUEST_RECEIVED: { label: "View request", url: getAppUrl("/friends#requests"), kind: "default" },
  FRIEND_REQUEST_ACCEPTED: { label: "Say hello", url: getAppUrl("/friends"), kind: "default" },
  PRACTICE_REMINDER: { label: "Continue learning", url: getAppUrl("/dashboard"), kind: "default" },
  CLASS_REGISTRATION_RECEIVED: { label: "Review registration", url: getAppUrl("/admin/students"), kind: "default" },
  CLASS_REGISTRATION_APPROVED: { label: "Go to your dashboard", url: getAppUrl("/dashboard"), kind: "default" },
  CLASS_REGISTRATION_REJECTED: { label: "View details", url: getAppUrl("/dashboard"), kind: "notice" },
  LESSON_BOOKING_RECEIVED: { label: "Review booking", url: getAppUrl("/admin/bookings"), kind: "default" },
  LESSON_BOOKING_CANCELED: { label: "View your bookings", url: getAppUrl("/lessons"), kind: "notice" },
  ANNOUNCEMENT: { label: "See announcement", url: getAppUrl("/dashboard"), kind: "default" },
  CREDIT_ADJUSTED: { label: "View your credits", url: getAppUrl("/lessons"), kind: "default" },
  ASSISTANT_ESCALATION: { label: "Open Support Chat", url: getAppUrl("/admin/support"), kind: "default" },
  // PAYMENT_PLAN_INSTALLMENT_DUE/OVERDUE are deliberately absent here: they
  // never pass emailCategory to createNotification (see the scheduled
  // reminder function in netlify/functions/payment-plan-installments.ts),
  // since their email is a dedicated itemized invoice
  // (sendPaymentPlanInvoiceEmail in email.ts), not this generic CTA-button
  // template — an entry here would be dead code.
  PAYMENT_PLAN_COMPLETED: { label: "View your plan", url: getAppUrl("/billing/plans"), kind: "default" },
  PAYMENT_PLAN_CANCELED: { label: "View your plan", url: getAppUrl("/billing/plans"), kind: "notice" },
  CREDITS_EXPIRED: { label: "View your credits", url: getAppUrl("/billing/plans"), kind: "notice" },
  // Points to /lessons, not /billing/plans like its CREDITS_EXPIRED sibling
  // — this fires while there's still time to act, and the actual action is
  // booking a makeup class, not reviewing plan/payment status.
  CREDITS_EXPIRING_SOON: { label: "Book a class", url: getAppUrl("/lessons"), kind: "notice" },
  RESERVED_SLOT_UNAVAILABLE: { label: "View your plan", url: getAppUrl("/billing/plans"), kind: "notice" },
  PLAN_CANCELLATION_FEEDBACK: { label: "Read feedback", url: getAppUrl("/admin/payment-plans?status=FEEDBACK"), kind: "default" },
  // /dashboard, not PAYMENT_APPROVED's own /billing/history: a curriculum
  // family bundle recipient never paid anything themselves, so their own
  // billing history has nothing to do with this, the roadmap they can now
  // actually use does.
  CURRICULUM_ACCESS_GRANTED: { label: "Go to your dashboard", url: getAppUrl("/dashboard"), kind: "default" },
  CURRICULUM_ACCESS_REVOKED: { label: "View curriculum access", url: getAppUrl("/billing/curriculum"), kind: "notice" },
};

/**
 * Always writes the in-app notification (that's the source of truth the
 * bell/inbox reads from) and, if emailCategory is given, checks the user's
 * per-category preference before also sending an email. A failed/slow email
 * here should never be allowed to look like the notification itself failed.
 */
export async function createNotification(params: CreateNotificationParams) {
  const notification = await prisma.notification.create({
    data: { userId: params.userId, type: params.type, title: params.title, body: params.body },
  });

  if (params.emailCategory) {
    const cta = NOTIFICATION_CTA[params.type];
    await maybeSendEmail(params.userId, params.emailCategory, params.title, params.body, cta).catch((err) =>
      console.error("Notification email failed (non-blocking):", err),
    );
  }

  return notification;
}

async function maybeSendEmail(
  userId: string,
  category: EmailCategory,
  title: string,
  body?: string,
  cta?: NotificationCta,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      notifyEmailPayments: true,
      notifyEmailRoleUpdates: true,
      notifyEmailSocial: true,
      notifyEmailReminders: true,
    },
  });
  if (!user) return;

  const enabled: Record<EmailCategory, boolean> = {
    payments: user.notifyEmailPayments,
    roleUpdates: user.notifyEmailRoleUpdates,
    social: user.notifyEmailSocial,
    reminders: user.notifyEmailReminders,
  };
  if (!enabled[category]) return;

  if (cta) {
    await sendNotificationEmailWithCta(user.email, title, body ?? "", { label: cta.label, url: cta.url }, cta.kind);
  } else {
    await sendNotificationEmail(user.email, title, body ?? "");
  }
}

/**
 * Public entry point for callers that want the email side-effect only —
 * new messages use this instead of createNotification, since they already
 * have their own separate unread surface (the Messages nav badge and
 * per-conversation counts), and would otherwise duplicate into the general
 * bell too. Failure here is non-blocking, same as createNotification.
 */
export async function sendEmailIfEnabled(
  userId: string,
  category: EmailCategory,
  title: string,
  body?: string,
  cta?: { label: string; url: string },
): Promise<void> {
  await maybeSendEmail(userId, category, title, body, cta ? { ...cta, kind: "default" } : undefined).catch((err) =>
    console.error("Notification email failed (non-blocking):", err),
  );
}

// NEW_MESSAGE is deliberately excluded here — messages have their own
// unread surface (Messages nav badge + conversation list), kept out of the
// general bell so the two notification systems stay visually distinct.
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null, type: { not: "NEW_MESSAGE" } } });
}

export async function getRecentNotifications(userId: string, limit = 15) {
  return prisma.notification.findMany({
    where: { userId, type: { not: "NEW_MESSAGE" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } });
}

export type { NotificationType };
