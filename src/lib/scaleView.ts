// Which layout (grid or list) Home's scale list uses, and how it is remembered. Pure, so it is tested without a browser.
//
// Kept in a cookie, not localStorage: the server reads it, so the page is drawn in the right layout the first time (no flash
// of Grid before it flips to List), and Safari's habit of clearing page storage after a week away does not forget it.

export type ScaleViewChoice = "grid" | "list";

export const SCALE_VIEW_COOKIE = "bnp-scales-view";
export const SCALE_VIEW_COOKIE_SECONDS = 60 * 60 * 24 * 365;

export function parseScaleView(value: string | null | undefined): ScaleViewChoice | null {
  return value === "grid" || value === "list" ? value : null;
}

export function scaleViewCookie(view: ScaleViewChoice): string {
  return `${SCALE_VIEW_COOKIE}=${view}; path=/; max-age=${SCALE_VIEW_COOKIE_SECONDS}; samesite=lax`;
}
