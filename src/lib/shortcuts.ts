/**
 * Keyboard shortcuts for the signed-in app, in one list so the command menu, the help sheet, the sidebar hints and the key handler
 * can never disagree. "Go to" shortcuts are two keys in a row (press G, then the letter), the way Gmail and GitHub do it.
 */
export interface GoShortcut {
  key: string;
  href: string;
  label: string;
  adminOnly?: boolean;
}

export const GO_SHORTCUTS: GoShortcut[] = [
  { key: "h", href: "/dashboard", label: "Home" },
  { key: "r", href: "/roadmap", label: "Roadmap" },
  { key: "p", href: "/practice", label: "Practice" },
  { key: "l", href: "/lessons", label: "Online lessons" },
  { key: "f", href: "/friends", label: "Friends" },
  { key: "u", href: "/profile", label: "Profile" },
  { key: "s", href: "/account", label: "Settings" },
  { key: "a", href: "/admin", label: "Admin overview", adminOnly: true },
  { key: "y", href: "/admin/payments", label: "Payments", adminOnly: true },
  { key: "c", href: "/admin/schedule?view=ATTENDANCE", label: "Class attendance", adminOnly: true },
];

export interface ActionShortcut {
  /** Shown as separate keys, e.g. ["⌘", "K"]; "Mod" becomes ⌘ on Apple devices and Ctrl elsewhere. */
  keys: string[];
  label: string;
  event: string;
}

export const OPEN_COMMAND_EVENT = "bnp:open-command";
export const OPEN_SHORTCUTS_EVENT = "bnp:open-shortcuts";
export const TOGGLE_SIDEBAR_EVENT = "bnp:toggle-sidebar";

export const ACTION_SHORTCUTS: ActionShortcut[] = [
  { keys: ["Mod", "K"], label: "Search and commands", event: OPEN_COMMAND_EVENT },
  { keys: ["/"], label: "Search and commands", event: OPEN_COMMAND_EVENT },
  { keys: ["B"], label: "Collapse or expand the sidebar", event: TOGGLE_SIDEBAR_EVENT },
  { keys: ["?"], label: "Show these shortcuts", event: OPEN_SHORTCUTS_EVENT },
];

/** The letters that follow G, for one destination. */
export function goKeysFor(href: string): string[] | null {
  const found = GO_SHORTCUTS.find((s) => s.href === href);
  return found ? ["G", found.key.toUpperCase()] : null;
}

/** True when the keypress came from somewhere the person is typing, where letters must stay letters. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** How long a "G" waits for its second key. */
export const CHORD_WINDOW_MS = 1200;

/**
 * Pure step of the key handler: given the key just pressed and whether G is waiting, say what to do. Kept free of the DOM so it is testable.
 */
export type ShortcutStep =
  | { kind: "wait" }
  | { kind: "go"; href: string }
  | { kind: "event"; name: string }
  | { kind: "none" };

export function nextShortcutStep(key: string, goPending: boolean, isAdmin: boolean): ShortcutStep {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (goPending) {
    const hit = GO_SHORTCUTS.find((s) => s.key === k && (!s.adminOnly || isAdmin));
    return hit ? { kind: "go", href: hit.href } : { kind: "none" };
  }
  if (k === "g") return { kind: "wait" };
  if (k === "/") return { kind: "event", name: OPEN_COMMAND_EVENT };
  if (k === "?") return { kind: "event", name: OPEN_SHORTCUTS_EVENT };
  if (k === "b") return { kind: "event", name: TOGGLE_SIDEBAR_EVENT };
  return { kind: "none" };
}
