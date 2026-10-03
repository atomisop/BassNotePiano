/**
 * Cookie consent: storage contract shared by the banner and by any future
 * code that wants to check before setting a non-essential cookie.
 *
 * Only one real category exists today: "necessary" (the NextAuth session
 * cookie, required for login to work at all, never asks for consent,
 * matching how every major consent framework treats strictly-necessary
 * cookies). "analytics" is offered as a real, savable choice even though
 * nothing in this codebase sets an analytics cookie yet. It's here so the
 * mechanism exists ahead of the cookie, not the other way around: if
 * analytics ever gets added, it should call `hasConsent("analytics")`
 * before firing rather than assume yes.
 *
 * ## Asked once per device
 *
 * The answer is stored twice:
 * - a one-year cookie set by the server (`/api/consent`), which is what
 *   makes it stick: Safari deletes anything a page writes for itself
 *   (localStorage, and cookies written from JavaScript) after 7 days
 *   without a visit, which made the banner come back for anyone visiting
 *   less than weekly. A cookie set by the server's own response isn't
 *   subject to that 7-day cap;
 * - localStorage, read first because it's instant and kept as a fallback
 *   (and so choices saved before the cookie existed still count).
 */

export type ConsentCategory = "analytics";

export interface ConsentState {
  analytics: boolean;
  decidedAt: string;
}

export const CONSENT_STORAGE_KEY = "bnp-cookie-consent";

/** Name of the server-set cookie; see /api/consent. Value: "1" or "0" (analytics), a dot, then the decision date. */
export const CONSENT_COOKIE = "bnp_consent";

/** Fired on `window` when a choice is saved in this tab. The browser's own
 *  `storage` event only fires in *other* tabs, never the one that made the
 *  write, so it can't be used for this. AssistantWidget listens for this to
 *  hold its greeting bubble back until the cookie banner is out of the way. */
export const CONSENT_DECIDED_EVENT = "bnp-cookie-consent-decided";

function readCookie(): ConsentState | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  if (!match) return null;
  const [flag, date] = decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1)).split(".");
  if (flag !== "1" && flag !== "0") return null;
  return { analytics: flag === "1", decidedAt: date || new Date(0).toISOString() };
}

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.analytics === "boolean" && typeof parsed?.decidedAt === "string") return parsed as ConsentState;
    }
  } catch {
    // Blocked or corrupt storage: fall through to the cookie.
  }
  try {
    const fromCookie = readCookie();
    if (fromCookie) {
      // Safari cleared localStorage but the server cookie survived: put the
      // local copy back so later reads are instant again.
      try {
        window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(fromCookie));
      } catch {
        // Fine: the cookie alone is enough.
      }
    }
    return fromCookie;
  } catch {
    return null;
  }
}

export function writeConsent(state: Omit<ConsentState, "decidedAt">) {
  if (typeof window === "undefined") return;
  const full: ConsentState = { ...state, decidedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(full));
  } catch {
    // Private browsing / blocked storage: the server cookie below still saves it.
  }
  // keepalive so the request still completes if the visitor navigates away
  // right after clicking.
  void fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analytics: state.analytics }),
    keepalive: true,
  }).catch(() => {
    // Best-effort: localStorage still holds the answer on this visit.
  });
  window.dispatchEvent(new Event(CONSENT_DECIDED_EVENT));
}

export function hasConsent(category: ConsentCategory): boolean {
  return readConsent()?.[category] === true;
}
