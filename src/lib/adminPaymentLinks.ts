/**
 * Links into Billing > Payments, shared by every screen that points at a payment or at one person's payments, and the rules the page
 * reads them back with. Pure (no database), so the browser can use them too.
 *
 * - `/admin/payments?user=<userId>`: one person's payments, every status (a status tab still narrows it).
 * - `/admin/payments?id=<paymentId>`: opens the status tab and page that payment is on, and marks it.
 * - `/admin/payments?q=<text>`: a search over every page, not only the one loaded.
 */

export const PAYMENT_FILTER_VALUES = ["PENDING_REVIEW", "UNCHECKED", "VERIFIED", "REJECTED", "REFUNDED", "AWAITING_TRANSFER", "EXPIRED", "ALL"] as const;
export type PaymentFilterValue = (typeof PAYMENT_FILTER_VALUES)[number];

export interface AdminPaymentsParams {
  status: PaymentFilterValue;
  /** True when the address named the status (a link to a payment then keeps it). */
  statusGiven: boolean;
  page: number;
  user: string | null;
  q: string | null;
  id: string | null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Reads the page's address. With a person or a search and no status named, every status is shown; otherwise the review queue. */
export function readAdminPaymentsParams(params: { status?: string; page?: string; user?: string; q?: string; id?: string }): AdminPaymentsParams {
  const user = params.user && ID.test(params.user) ? params.user : null;
  const id = params.id && ID.test(params.id) ? params.id : null;
  const q = params.q?.trim().slice(0, 80) || null;
  const requested = params.status?.toUpperCase();
  const named = PAYMENT_FILTER_VALUES.find((v) => v === requested);
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  return { status: named ?? (user || q ? "ALL" : "PENDING_REVIEW"), statusGiven: !!named, page, user, q, id };
}

/** The address for a view of the list. Leaves out what is the default, so the plain queue stays `/admin/payments`. */
export function adminPaymentsHref(view: { status?: PaymentFilterValue; page?: number; user?: string | null; q?: string | null; id?: string | null }): string {
  const params = new URLSearchParams();
  const defaultStatus: PaymentFilterValue = view.user || view.q ? "ALL" : "PENDING_REVIEW";
  if (view.user) params.set("user", view.user);
  if (view.q) params.set("q", view.q);
  if (view.status && view.status !== defaultStatus) params.set("status", view.status);
  if (view.page && view.page > 1) params.set("page", String(view.page));
  if (view.id) params.set("id", view.id);
  const query = params.toString();
  return query ? `/admin/payments?${query}` : "/admin/payments";
}

/** One payment, wherever it is in the list. */
export function paymentHref(paymentId: string): string {
  return adminPaymentsHref({ id: paymentId });
}

/** Every payment about one person. */
export function personPaymentsHref(userId: string): string {
  return adminPaymentsHref({ user: userId });
}
