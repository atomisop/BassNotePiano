import { useSyncExternalStore } from "react";

/**
 * Tiny shared flag for "we are about to change screens". Call
 * `startNavigation()` right before a router.push/replace or signOut that
 * follows a button press; NavigationOverlay shows the loader until the
 * pathname changes (or a timeout passes, so a failed navigation never leaves
 * a stuck overlay).
 */
let pending = false;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function emit(next: boolean) {
  if (pending === next) return;
  pending = next;
  listeners.forEach((l) => l());
}

export function startNavigation() {
  emit(true);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => emit(false), 15_000);
}

export function endNavigation() {
  if (timer) clearTimeout(timer);
  emit(false);
}

export function useNavigationPending() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
    () => false,
  );
}
