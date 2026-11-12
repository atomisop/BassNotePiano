// What the sign-up form remembers for the length of one browser tab, so going Back from "verify your email" (to fix a typo, say)
// does not empty the form. Name and email only: the password is never stored anywhere. sessionStorage, so it is gone when the tab
// closes, and every read and write is guarded because storage can be blocked.

export const SIGNUP_DRAFT_KEY = "bnp-signup-draft";

export interface SignupDraft {
  name: string;
  email: string;
}

/** A stored draft, or null when it is missing, malformed or holds nothing worth putting back. */
export function parseSignupDraft(raw: string | null | undefined): SignupDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { name?: unknown; email?: unknown } | null;
    const name = typeof value?.name === "string" ? value.name.slice(0, 120) : "";
    const email = typeof value?.email === "string" ? value.email.slice(0, 254) : "";
    return name || email ? { name, email } : null;
  } catch {
    return null;
  }
}

export function readSignupDraft(): SignupDraft | null {
  try {
    return parseSignupDraft(window.sessionStorage.getItem(SIGNUP_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function saveSignupDraft(draft: SignupDraft): void {
  try {
    window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify({ name: draft.name, email: draft.email }));
  } catch {
    /* storage can be blocked; the form then simply starts empty */
  }
}

export function clearSignupDraft(): void {
  try {
    window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// The claim a registration, a log in to an unconfirmed account, or an address change was handed (see pendingSignup.ts). It is what
// lets the browser that set a password, and only that browser, keep it when the email is confirmed. It lives in localStorage (so a
// second tab on the same browser still has it), is tied to ONE email address, and is dropped after a day. Alone it is worthless: it
// only matters together with the code emailed to that address.

export const SIGNUP_CLAIM_KEY = "bnp-signup-claim";
const CLAIM_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** The claim kept for this email, or undefined when there is none, it is for another address, or it is older than a day. */
export function parseSignupClaim(raw: string | null | undefined, email: string, now: number = Date.now()): string | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as { claim?: unknown; email?: unknown; at?: unknown } | null;
    if (typeof value?.claim !== "string" || !value.claim || typeof value.email !== "string" || typeof value.at !== "number") return undefined;
    if (value.email.trim().toLowerCase() !== email.trim().toLowerCase()) return undefined;
    if (now - value.at > CLAIM_LIFETIME_MS || value.at > now + 60_000) return undefined;
    return value.claim;
  } catch {
    return undefined;
  }
}

export function readSignupClaim(email: string): string | undefined {
  try {
    return parseSignupClaim(window.localStorage.getItem(SIGNUP_CLAIM_KEY), email);
  } catch {
    return undefined;
  }
}

export function saveSignupClaim(claim: unknown, email: string): void {
  try {
    if (typeof claim === "string" && claim) window.localStorage.setItem(SIGNUP_CLAIM_KEY, JSON.stringify({ claim, email: email.trim().toLowerCase(), at: Date.now() }));
    else window.localStorage.removeItem(SIGNUP_CLAIM_KEY);
  } catch {
    /* storage can be blocked; the password on file is then forgotten at confirmation, and the person uses "Email me a code instead" */
  }
}

export function clearSignupClaim(): void {
  try {
    window.localStorage.removeItem(SIGNUP_CLAIM_KEY);
  } catch {
    /* ignore */
  }
}
