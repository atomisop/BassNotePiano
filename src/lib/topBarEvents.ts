// On phones the top bar keeps only Atom, the credit badge and the profile picture; every other button lives in the profile menu.
// Those panels are portals pinned to the screen, so the menu opens them by announcing an event, and they announce their badge
// counts the same way. Names in one place so the sender and the listener can never drift apart.

export const OPEN_NOTIFICATIONS = "bnp:open-notifications";
/** Opens the bell on its Support tab (the student's conversation with the team). */
export const OPEN_SUPPORT = "bnp:open-support";
export const OPEN_STUDENT_NOTES = "bnp:open-student-notes";
export const OPEN_ATTENDANCE = "bnp:open-attendance";
export const UNREAD_COUNT = "bnp:unread-count";
/** The number of active bookings (the same number the panel's own badge shows). */
export const ATTENDANCE_READY_COUNT = "bnp:attendance-ready-count";

export function announce(name: string, detail?: number): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Calls `handler` whenever the event fires. Returns the cleanup. */
export function listen(name: string, handler: (detail: number) => void): () => void {
  const wrapped = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(name, wrapped);
  return () => window.removeEventListener(name, wrapped);
}
