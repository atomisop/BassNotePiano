import { safeCallbackPath } from "@/lib/safeRedirect";
import { slotKey } from "@/lib/slotWaitlistRules";

/**
 * Where a student is sent so a job finishes on the screen they are already on, or lands on the exact step it needs.
 * Pure (no database, no Next.js), so the browser, the middleware and the server share the same rules and they are tested.
 */

/** "scheduleId:chunkIndex", the way a weekly time is written in a link (?slot=, ?changeTime=). */
export { slotKey };

/** Reads a weekly time from a link. Anything that does not look like one is ignored (null), never trusted further. */
export function parseSlotKey(raw: string | null | undefined): { scheduleId: string; chunkIndex: number } | null {
  // A repeated query parameter arrives as an array: not a weekly time.
  if (typeof raw !== "string" || !raw) return null;
  const match = /^([A-Za-z0-9_-]{1,64}):(\d{1,3})$/.exec(raw.trim());
  if (!match) return null;
  const chunkIndex = Number(match[2]);
  return Number.isInteger(chunkIndex) ? { scheduleId: match[1], chunkIndex } : null;
}

/** The weekly-time picker on Lessons, open, with that time chosen when one is given. */
export function changeTimePath(key?: string | null): string {
  const slot = parseSlotKey(key);
  return `/lessons?changeTime=${slot ? encodeURIComponent(slotKey(slot.scheduleId, slot.chunkIndex)) : ""}`;
}

/** The plan form with a weekly time already picked (someone with no plan who chose a time somewhere else). */
export function startPlanWithTimePath(key?: string | null): string {
  const slot = parseSlotKey(key);
  return slot ? `/billing/plans?slot=${encodeURIComponent(slotKey(slot.scheduleId, slot.chunkIndex))}` : "/billing/plans";
}

/** A payment's printable receipt. */
export function receiptPath(paymentId: string): string {
  return `/billing/receipt/${encodeURIComponent(paymentId)}`;
}

/** Payment history with that payment's pay sheet already open (to pay or resubmit it). */
export function payAgainPath(paymentId: string): string {
  return `/billing/history?pay=${encodeURIComponent(paymentId)}`;
}

/** Where a group's bill is paid: a parent pays on the Parent page, a group payer on Billing > Plans. Same rule as the bill bar. */
export function groupBillPath(kind: "FAMILY" | "PARENT" | string | null | undefined): string {
  return kind === "PARENT" ? "/parent" : "/billing/plans";
}

/** Lessons pages that a not-yet-onboarded person must not lose on their way through the welcome wizard. */
export function onboardingRedirect(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("_rsc"); // Next.js's own prefetch marker, not part of the page
  const target = params.size > 0 ? `${pathname}?${params}` : pathname;
  const safe = safeCallbackPath(target, "");
  if (!safe || safe === "/" || safe === "/dashboard" || safe.startsWith("/onboarding")) return "/onboarding";
  return `/onboarding?${new URLSearchParams({ next: safe })}`;
}

/** The "Create account" link on the sign-in screen, carrying where the person was going (a plan picked on /pricing, say). */
export function registerHref(callbackUrl: string | null | undefined, embedded = false): string {
  if (embedded) return "/register";
  const safe = safeCallbackPath(callbackUrl, "");
  if (!safe || safe === "/" || safe === "/dashboard") return "/register";
  return `/register?${new URLSearchParams({ callbackUrl: safe })}`;
}

/** The "Log in" link on the sign-up screen, the same way back. */
export function loginHref(callbackUrl: string | null | undefined): string {
  const safe = safeCallbackPath(callbackUrl, "");
  if (!safe || safe === "/" || safe === "/dashboard") return "/login";
  return `/login?${new URLSearchParams({ callbackUrl: safe })}`;
}

/** The page to come back to after connecting Discord: the one asked for, else the page the button was on, else Lessons. */
export function discordReturnPath(asked: string | null | undefined, referer: string | null | undefined, origin: string): string {
  const fromReferer = (() => {
    if (!referer) return null;
    try {
      const url = new URL(referer);
      return url.origin === origin ? `${url.pathname}${url.search}` : null;
    } catch {
      return null;
    }
  })();
  for (const candidate of [asked, fromReferer]) {
    const safe = safeCallbackPath(candidate, "");
    // Never back into an /api route (that is where the connect button itself lives) and never somewhere very long.
    if (safe && !safe.startsWith("/api/") && safe.length <= 300) return safe;
  }
  return "/lessons";
}

/** Adds the "how did connecting go" flag to the page Discord sends the student back to. */
export function withDiscordFlag(path: string, flag: string): string {
  const safe = safeCallbackPath(path, "/lessons");
  const [pathname, query = ""] = safe.split("?");
  const params = new URLSearchParams(query);
  params.set("discord", flag);
  return `${pathname}?${params}`;
}

/** "Connect Discord and join": connect first, then come back to Lessons, which opens that class call. */
export function connectAndJoinPath(bookingId: string | null | undefined): string {
  const join = bookingId && /^[A-Za-z0-9_-]{1,64}$/.test(bookingId) ? bookingId : "next";
  return `/api/discord/connect?${new URLSearchParams({ return: `/lessons?join=${join}` })}`;
}

/** The scholarship card's follow-up: start the 6 Month plan, switch a running plan to it, or nothing left to do. */
export function scholarshipNextStep(plan: { term: string; familyGroupId: string | null } | null): "start" | "switch" | null {
  if (!plan) return "start";
  if (plan.familyGroupId) return null;
  return plan.term === "TERM_6" ? null : "switch";
}

/** The pause refusals that are only about money: they come with a Pay button instead of a dead end. */
export function pauseNeedsPayment(reason: string | null): boolean {
  return Boolean(reason && /\bpay\b|payment/i.test(reason) && !/already paused/i.test(reason));
}
