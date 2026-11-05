// Pure helpers for the command menu's "Recent" list and for the links that open a student's page with one job ready.
// Kept apart from the component so the rules are tested without a browser.

export interface RecentCommand {
  href: string;
  label: string;
}

const KEY = "bnp-cmd-recent";
export const MAX_RECENT = 4;

/** The jobs a student page can open straight into (`?do=`). */
export type PersonActionId = "credits" | "book" | "plan" | "payments";

export function personActionHref(userId: string, action: PersonActionId): string {
  return `/admin/users/${userId}?do=${action}`;
}

/** Newest first, no repeats of the same link, never more than MAX_RECENT. */
export function pushRecent(list: RecentCommand[], next: RecentCommand): RecentCommand[] {
  return [next, ...list.filter((r) => r.href !== next.href)].slice(0, MAX_RECENT);
}

export function readRecentCommands(): RecentCommand[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is RecentCommand => typeof r?.href === "string" && typeof r?.label === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberCommand(next: RecentCommand): RecentCommand[] {
  const list = pushRecent(readRecentCommands(), next);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  return list;
}
