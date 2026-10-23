// Rules for the signed-in app's scroll helpers (ScrollAssist). Pure, so they are tested without a browser.

/** The page's own scroll area scrolls this many screens before the back-to-top button appears. */
export const BACK_TO_TOP_SCREENS = 1.5;

export function shouldShowBackToTop(scrollTop: number, clientHeight: number): boolean {
  return clientHeight > 0 && scrollTop > clientHeight * BACK_TO_TOP_SCREENS;
}

/** One remembered position per page; the query matters (a tab or filter in the address is a different view). */
export function scrollKey(pathname: string, search: string): string {
  return `${pathname}${search ? (search.startsWith("?") ? search : `?${search}`) : ""}`;
}

/** Pages that manage their own scrolling panes, where the main area's position means nothing. */
export function ignoresMainScroll(pathname: string): boolean {
  return pathname === "/messages" || pathname.startsWith("/messages/");
}

const STORAGE_KEY = "bnp-scroll-positions";
const MAX_REMEMBERED = 40;

export type ScrollPositions = Record<string, number>;

export function readPositions(raw: string | null): ScrollPositions {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ScrollPositions = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Remembers `top` for `key`, dropping the oldest pages once there are too many. A page at the very top is simply forgotten. */
export function withPosition(positions: ScrollPositions, key: string, top: number): ScrollPositions {
  const next: ScrollPositions = { ...positions };
  delete next[key];
  if (top > 0) next[key] = Math.round(top);
  const keys = Object.keys(next);
  if (keys.length > MAX_REMEMBERED) for (const k of keys.slice(0, keys.length - MAX_REMEMBERED)) delete next[k];
  return next;
}

export const SCROLL_POSITIONS_STORAGE_KEY = STORAGE_KEY;
