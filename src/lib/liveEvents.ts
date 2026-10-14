// One way for any screen to say "something just changed" so every part of the page that shows it (the unread badges, the credit
// badge, the page's own data) updates at once, without waiting for its timer. Client side only. Call it right after an action
// that changes what other parts of the screen show: reading a message or mail, paying, booking, cancelling, practicing.
//
//   messages       the unread count on the dock
//   notifications  the bell and mail count (and the number on the profile picture)
//   status         the credit badge, Discord and practice banners (src/lib/meStatus.ts)
//   page           the current page re-fetches its own data (router.refresh)
//
// `announceChange("payments")` is a shortcut for everything a payment can touch.

export type LiveKind = "messages" | "notifications" | "status" | "page";
export const LIVE_EVENT = "bnp:live";

const SHORTCUTS: Record<string, LiveKind[]> = {
  payments: ["notifications", "status", "page"],
  booking: ["notifications", "status", "page"],
  everything: ["messages", "notifications", "status", "page"],
};

// A chat that is open and being polled announces "messages" on every tick; the dock only needs to hear it now and then.
const lastAnnounced = new Map<LiveKind, number>();
const THROTTLE_MS = 2_000;

export function announceChange(...kinds: (LiveKind | keyof typeof SHORTCUTS)[]): void {
  if (typeof window === "undefined") return;
  const expanded = new Set<LiveKind>();
  for (const kind of kinds) for (const k of SHORTCUTS[kind] ?? [kind as LiveKind]) expanded.add(k);
  const now = Date.now();
  for (const k of Array.from(expanded)) {
    if (k === "page") continue;
    if (now - (lastAnnounced.get(k) ?? 0) < THROTTLE_MS) expanded.delete(k);
    else lastAnnounced.set(k, now);
  }
  if (expanded.size === 0) return;
  window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: Array.from(expanded) }));
  // The credit badge and banners also listen to their own older event name.
  if (expanded.has("status")) window.dispatchEvent(new Event("bnp:status-changed"));
}

/** Calls `handler` whenever `kind` is announced. Returns the cleanup. */
export function onChange(kind: LiveKind, handler: () => void): () => void {
  const wrapped = (e: Event) => {
    if (((e as CustomEvent<LiveKind[]>).detail ?? []).includes(kind)) handler();
  };
  window.addEventListener(LIVE_EVENT, wrapped);
  return () => window.removeEventListener(LIVE_EVENT, wrapped);
}
