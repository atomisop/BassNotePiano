// Which new notices should also pop up as a toast. Pure, so the rule is tested without a browser.
//
// The notice text is written by the server (`studentNotices.ts` and friends) in plain English already, so the toast
// reuses it word for word instead of inventing a second wording that could drift from the bell and the email.

export type PaymentToastKind = "success" | "error" | "warning" | "info";

export interface PaymentToast {
  kind: PaymentToastKind;
  title: string;
  description?: string;
}

interface NoticeLike {
  id: string;
  type: string;
  title: string;
  body: string | null;
}

const KIND_BY_TYPE: Record<string, PaymentToastKind> = {
  PAYMENT_RECEIVED: "success",
  PAYMENT_APPROVED: "success",
  PAYMENT_PLAN_UPDATED: "info",
  PAYMENT_REJECTED: "error",
  PAYMENT_AMOUNT_MISMATCH: "warning",
};

/** A toast has room for about two short lines; the full text stays in the bell. */
const MAX_DESCRIPTION = 140;

export function toastForNotice(notice: NoticeLike): PaymentToast | null {
  const kind = KIND_BY_TYPE[notice.type];
  if (!kind) return null;
  const body = notice.body?.trim();
  const description = body ? (body.length > MAX_DESCRIPTION ? `${body.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : body) : undefined;
  return { kind, title: notice.title, description };
}

/**
 * The toasts to show for one poll. `seen` is every notice id this tab has already looked at; the first poll of a page
 * load only fills it (nobody wants last week's approval popping up on sign-in), and later polls toast only what is new.
 */
export function newPaymentToasts(notices: NoticeLike[], seen: Set<string> | null): { toasts: PaymentToast[]; seen: Set<string> } {
  const nextSeen = new Set(seen ?? []);
  const toasts: PaymentToast[] = [];
  for (const notice of notices) {
    const isNew = seen !== null && !seen.has(notice.id);
    nextSeen.add(notice.id);
    if (!isNew) continue;
    const toast = toastForNotice(notice);
    if (toast) toasts.push(toast);
  }
  // Oldest first, so a burst reads in the order things happened (the list arrives newest first).
  return { toasts: toasts.reverse(), seen: nextSeen };
}
