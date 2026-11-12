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
