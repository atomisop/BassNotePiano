/**
 * Cookie consent — storage contract shared by the banner and by any future
 * code that wants to check before setting a non-essential cookie.
 *
 * Only one real category exists today: "necessary" (the NextAuth session
 * cookie — required for login to work at all, never asks for consent,
 * matching how every major consent framework treats strictly-necessary
 * cookies). "analytics" is offered as a real, savable choice even though
 * nothing in this codebase sets an analytics cookie yet (grepped before
 * writing this — no gtag/GA/posthog/mixpanel/hotjar anywhere in src/). It's
 * here so the mechanism exists ahead of the cookie, not the other way
 * around: if analytics ever gets added, it should call `hasConsent("analytics")`
 * before firing rather than assume yes.
 */

export type ConsentCategory = "analytics";

export interface ConsentState {
  analytics: boolean;
  /** ISO timestamp of the choice, so "reject" isn't silently reinterpreted later. */
  decidedAt: string;
}

export const CONSENT_STORAGE_KEY = "bnp-cookie-consent";

/** Fired on `writeConsent()` so same-tab listeners can react immediately.
 *  The browser's own `storage` event only fires in *other* tabs, never the
 *  one that made the write, so it can't be used for this. AssistantWidget
 *  listens for this to hold its greeting bubble back until the cookie
 *  banner is out of the way (see its own comment for why). */
export const CONSENT_DECIDED_EVENT = "bnp-cookie-consent-decided";

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics !== "boolean" || typeof parsed?.decidedAt !== "string") return null;
    return parsed as ConsentState;
  } catch {
    // Safari private mode throws on localStorage access rather than
    // returning null — same defensive pattern as THEME_BOOT_SCRIPT.
    return null;
  }
}

export function writeConsent(state: Omit<ConsentState, "decidedAt">) {
  if (typeof window === "undefined") return;
  try {
    const full: ConsentState = { ...state, decidedAt: new Date().toISOString() };
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(full));
  } catch {
    // If storage is unavailable the banner will just reappear next visit —
    // safe failure mode, no cookie gets set either way.
  }
  // Dispatched even when the try block above failed to write: the banner
  // still hides itself either way (see CookieConsentBanner's own `decide`),
  // so anything waiting on "the banner is gone" should hear about it too.
  window.dispatchEvent(new Event(CONSENT_DECIDED_EVENT));
}

/** For future non-essential code to check before it runs. Defaults closed. */
export function hasConsent(category: ConsentCategory): boolean {
  return readConsent()?.[category] === true;
}
