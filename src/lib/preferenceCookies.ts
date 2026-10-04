/**
 * Small preference cookies the server sets so a choice sticks to the device
 * (see cookieConsent.ts for why server-set, not written from JavaScript).
 */

export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const ATOM_DISMISS_COOKIE = "bnp_atom_dismiss";

export function preferenceCookieOptions(httpOnly: boolean) {
  return {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly,
  };
}

/**
 * These routes change what a visitor's browser remembers, so they only
 * accept a JSON POST from this site's own pages. A cross-site form can't
 * send `application/json` without a CORS preflight (which this route never
 * approves), and the Origin check rejects any other site outright: no other
 * page can, say, flip someone's cookie choice to "accept".
 */
export function isSameOriginJsonPost(req: Request): boolean {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
