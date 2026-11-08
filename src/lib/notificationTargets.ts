import type { NotificationType } from "@prisma/client";

/**
 * Where tapping a notification goes when the notification itself did not record a more exact page. Every type is listed
 * (the record type makes a new type fail to compile until it gets a target), and a notification created with its own
 * `href` (one student's page, one payment) always wins over this.
 */
export const DEFAULT_NOTIFICATION_HREF: Record<NotificationType, string> = {
  MAIL_MESSAGE: "/mail",
  BADGE_EARNED: "/profile",
  ADMIN_ALERT: "/admin",
  PAYMENT_SUBMITTED: "/admin/payments",
  PAYMENT_APPROVED: "/billing/history",
  PAYMENT_REJECTED: "/billing/history",
  ROLE_UPDATED: "/admin",
  FRIEND_REQUEST_RECEIVED: "/friends#requests",
  FRIEND_REQUEST_ACCEPTED: "/friends",
  NEW_MESSAGE: "/dashboard",
  PRACTICE_REMINDER: "/practice",
  CLASS_REGISTRATION_RECEIVED: "/admin/students",
  CLASS_REGISTRATION_APPROVED: "/dashboard",
  CLASS_REGISTRATION_REJECTED: "/dashboard",
  LESSON_BOOKING_RECEIVED: "/admin/schedule?view=ATTENDANCE",
  LESSON_BOOKING_CANCELED: "/lessons",
  ANNOUNCEMENT: "/dashboard",
  CREDIT_ADJUSTED: "/lessons",
  ASSISTANT_ESCALATION: "/admin/support",
  SUPPORT_TRANSFER: "/admin/support?filter=mine",
  PAYMENT_PLAN_INSTALLMENT_DUE: "/billing/plans",
  PAYMENT_PLAN_INSTALLMENT_OVERDUE: "/billing/plans",
  PAYMENT_PLAN_COMPLETED: "/billing/plans",
  PAYMENT_PLAN_CANCELED: "/billing/plans",
  CREDITS_EXPIRED: "/billing/plans",
  CREDITS_EXPIRING_SOON: "/lessons",
  RESERVED_SLOT_UNAVAILABLE: "/billing/plans",
  PLAN_CANCELLATION_FEEDBACK: "/admin/payment-plans?status=FEEDBACK",
  CURRICULUM_ACCESS_GRANTED: "/roadmap",
  RESERVED_SLOT_CHANGED: "/billing/plans",
  CLASS_REMINDER: "/lessons",
  CURRICULUM_ACCESS_REVOKED: "/billing/plans",
  PAYMENT_AMOUNT_MISMATCH: "/billing/history",
  ACCOUNT_UPDATE: "/account",
  LESSON_BOOKING_CONFIRMED: "/lessons",
  ATTENDANCE_RECORDED: "/lessons",
  PAYMENT_RECEIVED: "/billing/history",
  TRIAL_ENDING: "/billing/plans",
  PAYMENT_PLAN_UPDATED: "/billing/plans",
  SLOT_WAITLIST_OPENED: "/billing/plans",
  BOOKING_REQUEST_RECEIVED: "/lessons?tab=upcoming",
  BOOKING_REQUEST_DECLINED: "/lessons",
  PARENT_LINK_REQUEST: "/account?tab=account#parent-mode",
  PARENT_LINK_ACCEPTED: "/parent",
  BANNER_PHONE: "/account?tab=account#phone",
  BANNER_DISCORD: "/lessons",
  BANNER_PRACTICE: "/practice",
  FRIEND_NUDGE: "/practice",
};

/** Only an in-app path is ever followed: a stored or passed link that is empty, absolute or protocol-relative is ignored. */
export function safeInAppHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\") ? trimmed : null;
}

/** The page a notification opens: its own recorded page first, else its type's default. */
export function notificationTarget(type: string, href?: string | null): string | null {
  return safeInAppHref(href) ?? (DEFAULT_NOTIFICATION_HREF as Record<string, string>)[type] ?? null;
}
