/**
 * Runs a screen change inside the browser's View Transition API, so the old screen crossfades into the new one instead of cutting.
 * Where the API is missing (Firefox, older Safari) or the person asked for less motion, the change simply happens at once.
 * `update` must change the page synchronously (wrap React state in flushSync) because the browser snapshots the page right after it returns.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === "undefined") return update();
  type Transition = { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> };
  const start = (document as Document & { startViewTransition?: (cb: () => void) => Transition }).startViewTransition;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!start || reduced) return update();
  try {
    const transition = start.call(document, update);
    // A newer change cancels an older transition; that is normal, so its promises must not surface as errors.
    for (const promise of [transition.ready, transition.finished, transition.updateCallbackDone]) promise?.catch(() => undefined);
  } catch {
    update();
  }
}
