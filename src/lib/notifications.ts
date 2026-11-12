import type { NotificationType } from "@prisma/client";
import { studentNoticeMutedFor } from "@/lib/notifyScope";
import { prisma } from "@/lib/prisma";
import { MAIL_ROUTED_TYPES, createMailMessage } from "@/lib/mail";
import { sendNotificationEmail, sendNotificationEmailWithCta, getAppUrl } from "@/lib/email";

import { notificationTarget, safeInAppHref } from "@/lib/notificationTargets";
import { sendPushToUser } from "@/lib/webPush";
import { categoryIsPushed } from "@/lib/pushRules";
import { EMAIL_PREF_SELECT, isEmailEnabled, type EmailCategory } from "@/lib/emailPreferences";
import { recordEmail } from "@/lib/emailLog";
type EmailKind = "default" | "notice";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** If set, also emails the user provided their matching notifyEmail* preference is on. */
  emailCategory?: EmailCategory;
  /** Send the email even if the person switched this category off: for a result they are waiting on, like a payment clearing. */
  alwaysEmail?: boolean;
  /** Overrides the default button for this type, e.g. a deep link to the exact page. `path` is an in-app path. */
  cta?: { label: string; path?: string; url?: string };
  /** The exact in-app page tapping this notification opens. Defaults to the button's page, then to the type's default page. */
  href?: string;
}

interface NotificationCta {
  label: string;
  url: string;
  kind: EmailKind;
}

// One deep-link per notification type, so the emailed version of a
// notification always lands you exactly where the in-app bell would,
// never just a generic "open the app" link. NEW_MESSAGE isn't here: it
// never goes through createNotification (see the comment below), so its
// CTA ("Click here to reply", deep-linked to the actual sender) is built
// by the caller in messages.ts/groupMessages.ts instead, where the
// senderId is actually known.
const NOTIFICATION_CTA: Partial<Record<NotificationType, NotificationCta>> = {
  ADMIN_ALERT: { label: "Open admin", url: getAppUrl("/admin"), kind: "default" },
  MAIL_MESSAGE: { label: "Open message", url: getAppUrl("/mail"), kind: "default" },
  PAYMENT_SUBMITTED: { label: "Review payment", url: getAppUrl("/admin/payments"), kind: "default" },
  PAYMENT_APPROVED: { label: "View your purchase", url: getAppUrl("/billing/history"), kind: "default" },
  PAYMENT_REJECTED: { label: "Review & resubmit", url: getAppUrl("/billing/history"), kind: "notice" },
  PAYMENT_AMOUNT_MISMATCH: { label: "View your payments", url: getAppUrl("/billing/history"), kind: "notice" },
  ROLE_UPDATED: { label: "Go to admin panel", url: getAppUrl("/admin"), kind: "default" },
  FRIEND_REQUEST_RECEIVED: { label: "View request", url: getAppUrl("/friends#requests"), kind: "default" },
  FRIEND_REQUEST_ACCEPTED: { label: "See your friends", url: getAppUrl("/friends"), kind: "default" },
  PRACTICE_REMINDER: { label: "Continue learning", url: getAppUrl("/roadmap"), kind: "default" },
  PARENT_LINK_REQUEST: { label: "Answer the request", url: getAppUrl("/account?tab=account#parent-mode"), kind: "default" },
  PARENT_LINK_ACCEPTED: { label: "Open Parent mode", url: getAppUrl("/parent"), kind: "default" },
  FRIEND_PARENT_REVIEW: { label: "Review it", url: getAppUrl("/parent"), kind: "default" },
  PARENT_CLASS_ASK: { label: "Move or skip it", url: getAppUrl("/parent"), kind: "default" },
  GROUP_INVITE: { label: "Accept or decline", url: getAppUrl("/billing/plans"), kind: "default" },
  BANNER_PHONE: { label: "Add my number", url: getAppUrl("/account?tab=account#phone"), kind: "default" },
  BANNER_DISCORD: { label: "Connect Discord", url: getAppUrl("/api/discord/connect"), kind: "default" },
  BANNER_PRACTICE: { label: "Start practice", url: getAppUrl("/practice"), kind: "default" },
  CLASS_REGISTRATION_RECEIVED: { label: "See their details", url: getAppUrl("/admin/contacts?show=application"), kind: "default" },
  CLASS_REGISTRATION_APPROVED: { label: "Go to your dashboard", url: getAppUrl("/dashboard"), kind: "default" },
  CLASS_REGISTRATION_REJECTED: { label: "View details", url: getAppUrl("/dashboard"), kind: "notice" },
  LESSON_BOOKING_RECEIVED: { label: "Review booking", url: getAppUrl("/admin/schedule?view=ATTENDANCE"), kind: "default" },
  LESSON_BOOKING_CANCELED: { label: "View your bookings", url: getAppUrl("/lessons"), kind: "notice" },
  ANNOUNCEMENT: { label: "See announcement", url: getAppUrl("/dashboard"), kind: "default" },
  CREDIT_ADJUSTED: { label: "View your credits", url: getAppUrl("/lessons"), kind: "default" },
  ASSISTANT_ESCALATION: { label: "Open Support Chat", url: getAppUrl("/admin/support"), kind: "default" },
  SUPPORT_TRANSFER: { label: "Open my cases", url: getAppUrl("/admin/support?filter=mine"), kind: "default" },
  // PAYMENT_PLAN_INSTALLMENT_DUE/OVERDUE are deliberately absent here: they
  // never pass emailCategory to createNotification (see the scheduled
  // reminder function in netlify/functions/payment-plan-installments.ts),
  // since their email is a dedicated itemized invoice
  // (sendPaymentPlanInvoiceEmail in email.ts), not this generic CTA-button
  // template, an entry here would be dead code.
  PAYMENT_PLAN_COMPLETED: { label: "View your plan", url: getAppUrl("/billing/plans"), kind: "default" },
  PAYMENT_PLAN_CANCELED: { label: "View your plan", url: getAppUrl("/billing/plans"), kind: "notice" },
  CREDITS_EXPIRED: { label: "View your credits", url: getAppUrl("/billing/plans"), kind: "notice" },
  // Points to /lessons, not /billing/plans like its CREDITS_EXPIRED sibling,
  // this fires while there's still time to act, and the actual action is
  // booking a makeup class, not reviewing plan/payment status.
  CLASS_REMINDER: { label: "See my classes", url: getAppUrl("/lessons"), kind: "default" },
  CREDITS_EXPIRING_SOON: { label: "Book a class", url: getAppUrl("/lessons"), kind: "notice" },
  // Straight to the weekly-time picker on Lessons, open, so a new time is picked where the classes are.
  RESERVED_SLOT_UNAVAILABLE: { label: "Pick a new time", url: getAppUrl("/lessons?changeTime="), kind: "notice" },
  PLAN_CANCELLATION_FEEDBACK: { label: "Read feedback", url: getAppUrl("/admin/payment-plans?status=FEEDBACK"), kind: "default" },
  // /dashboard, not PAYMENT_APPROVED's own /billing/history: a curriculum
  // family bundle recipient never paid anything themselves, so their own
  // billing history has nothing to do with this, the roadmap they can now
  // actually use does.
  CURRICULUM_ACCESS_GRANTED: { label: "Open your roadmap", url: getAppUrl("/roadmap"), kind: "default" },
  CURRICULUM_ACCESS_REVOKED: { label: "See class plans", url: getAppUrl("/billing/plans"), kind: "notice" },
  ACCOUNT_UPDATE: { label: "Open settings", url: getAppUrl("/account"), kind: "notice" },
  LESSON_BOOKING_CONFIRMED: { label: "See my classes", url: getAppUrl("/lessons"), kind: "default" },
  ATTENDANCE_RECORDED: { label: "See my classes", url: getAppUrl("/lessons"), kind: "default" },
  PAYMENT_RECEIVED: { label: "View your payments", url: getAppUrl("/billing/history"), kind: "default" },
  TRIAL_ENDING: { label: "See class plans", url: getAppUrl("/billing/plans"), kind: "notice" },
  PAYMENT_PLAN_UPDATED: { label: "View your plan", url: getAppUrl("/billing/plans"), kind: "default" },
  // The call site adds the time itself (slotWaitlist.ts); Lessons opens the picker with it, or the plan form when there is no plan.
  SLOT_WAITLIST_OPENED: { label: "Pick your time", url: getAppUrl("/lessons?changeTime="), kind: "default" },
  BOOKING_REQUEST_RECEIVED: { label: "See your request", url: getAppUrl("/lessons?tab=upcoming"), kind: "default" },
  BOOKING_REQUEST_DECLINED: { label: "Pick another time", url: getAppUrl("/lessons"), kind: "default" },
};

/** The in-app path of a full link, or null if it can't be read (a notice must never fail over its link). */
function pathOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return null;
  }
}

/**
 * Always writes the in-app notification (that's the source of truth the
 * bell/inbox reads from) and, if emailCategory is given, checks the user's
 * per-category preference before also sending an email. A failed/slow email
 * here should never be allowed to look like the notification itself failed.
 */
export async function createNotification(params: CreateNotificationParams) {
  // The studio turned "Notify student" off for the action this comes from (notifyScope.ts): the change happened, the student is not told.
  if (await studentNoticeMutedFor({ userId: params.userId })) return null;
  // Payment and billing notices go to the person's Mail, not the bell, so they
  // are not lost among everyday notifications. The email (if their preference
  // allows) is unchanged.
  const mailKind = MAIL_ROUTED_TYPES[params.type];
  const cta: NotificationCta | undefined = params.cta
    ? { label: params.cta.label, url: params.cta.url ?? getAppUrl(params.cta.path ?? "/"), kind: "default" }
    : NOTIFICATION_CTA[params.type];
  const href = notificationTarget(params.type, safeInAppHref(params.href) ?? (cta ? pathOf(cta.url) : null));
  const notification = mailKind
    ? await createMailMessage({
        userId: params.userId,
        kind: mailKind,
        title: params.title,
        body: params.body ?? "",
        actionLabel: cta?.label ?? null,
        actionHref: cta ? pathOf(cta.url) : null,
      })
    : await prisma.notification.create({
        data: { userId: params.userId, type: params.type, title: params.title, body: params.body, href },
      });

  if (params.emailCategory) {
    await maybeSendEmail(params.userId, params.emailCategory, params.title, params.body, cta, params.alwaysEmail).catch((err) =>
      console.error("Notification email failed (non-blocking):", err),
    );
  }

  // Class and practice reminders also go to the person's phone or browser when they turned push on, under the same switch as the email.
  if (params.emailCategory && categoryIsPushed(params.emailCategory)) {
    await maybePush(params.userId, params.emailCategory, params.title, params.body, (cta ? pathOf(cta.url) : null) ?? undefined);
  }

  return notification;
}

async function maybePush(userId: string, category: EmailCategory, title: string, body: string | undefined, path: string | undefined) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: EMAIL_PREF_SELECT });
    if (!user || user.bannedAt || !isEmailEnabled(user, category)) return;
    await sendPushToUser(userId, { title, body: body ?? "", url: path });
  } catch (err) {
    console.error("Notification push failed (non-blocking):", err);
  }
}

/** The names of the email switches as Settings shows them, for the "not sent" reason on Admin > Inbox > Sent. */
const SWITCH_NAME: Record<EmailCategory, string> = {
  payments: "Payments and invoices",
  roleUpdates: "Account updates",
  social: "Social",
  reminders: "Practice and class reminders",
  classes: "Class updates",
};

async function maybeSendEmail(
  userId: string,
  category: EmailCategory,
  title: string,
  body?: string,
  cta?: NotificationCta,
  force = false,
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: EMAIL_PREF_SELECT });
  if (!user) return;
  // A banned account is sent nothing, whatever its switches say. Both kinds of "not sent" are recorded for Admin > Inbox > Sent.
  if (user.bannedAt) {
    await recordEmail({ to: user.email, subject: title, status: "SKIPPED", detail: "Banned account", userId });
    return;
  }
  if (!isEmailEnabled(user, category) && !force) {
    await recordEmail({ to: user.email, subject: title, status: "SKIPPED", detail: `They turned off "${SWITCH_NAME[category]}" emails`, userId });
    return;
  }

  // Every email a switch governs carries an "Unsubscribe" for that same switch.
  const unsubscribe = { userId, category };
  if (cta) {
    await sendNotificationEmailWithCta(user.email, title, body ?? "", { label: cta.label, url: cta.url }, cta.kind, unsubscribe);
  } else {
    await sendNotificationEmail(user.email, title, body ?? "", "default", unsubscribe);
  }
}

/**
 * Public entry point for callers that want the email side-effect only,
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

// NEW_MESSAGE is deliberately excluded here, messages have their own
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
