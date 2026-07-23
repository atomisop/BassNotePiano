import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";

type EmailCategory = "payments" | "roleUpdates" | "social" | "reminders";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** If set, also emails the user provided their matching notifyEmail* preference is on. */
  emailCategory?: EmailCategory;
}

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
    await maybeSendEmail(params.userId, params.emailCategory, params.title, params.body).catch((err) =>
      console.error("Notification email failed (non-blocking):", err),
    );
  }

  return notification;
}

async function maybeSendEmail(userId: string, category: EmailCategory, title: string, body?: string) {
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

  await sendNotificationEmail(user.email, title, body ?? "");
}

/**
 * Public entry point for callers that want the email side-effect only —
 * new messages use this instead of createNotification, since they already
 * have their own separate unread surface (the Messages nav badge and
 * per-conversation counts), and would otherwise duplicate into the general
 * bell too. Failure here is non-blocking, same as createNotification.
 */
export async function sendEmailIfEnabled(userId: string, category: EmailCategory, title: string, body?: string): Promise<void> {
  await maybeSendEmail(userId, category, title, body).catch((err) =>
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
