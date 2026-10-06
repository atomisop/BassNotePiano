/**
 * Lets a button elsewhere in the app (the dashboard TopBar's "Ask AI") open
 * Atom's chat panel, and lets Atom know that button exists so its own floating
 * launcher and greeting bubble step aside. Same same-tab CustomEvent pattern as
 * overlayNav.ts.
 */
export const OPEN_ATOM_EVENT = "bnp-open-atom";
export const ATOM_TRIGGER_EVENT = "bnp-atom-trigger";
export const OPEN_ATOM_CASE_EVENT = "bnp-open-atom-case";

export function openAtom() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_ATOM_EVENT));
}

/** Opens Atom straight into a live support case that was just created elsewhere (for example from Mail). */
export function openAtomWithCase(escalationId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(OPEN_ATOM_CASE_EVENT, { detail: escalationId }));
}

export function setAtomTriggerPresent(present: boolean) {
  if (typeof window === "undefined") return;
  (window as unknown as { __atomTrigger?: boolean }).__atomTrigger = present;
  window.dispatchEvent(new CustomEvent<boolean>(ATOM_TRIGGER_EVENT, { detail: present }));
}

export function isAtomTriggerPresent() {
  return typeof window !== "undefined" && Boolean((window as unknown as { __atomTrigger?: boolean }).__atomTrigger);
}
