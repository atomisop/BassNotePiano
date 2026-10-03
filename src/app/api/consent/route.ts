import { NextResponse, type NextRequest } from "next/server";
import { CONSENT_COOKIE } from "@/lib/cookieConsent";
import { isSameOriginJsonPost, preferenceCookieOptions } from "@/lib/preferenceCookies";

/**
 * Saves the cookie-banner answer as a one-year cookie set by the server, so
 * the banner is asked once per device instead of returning whenever Safari
 * clears what pages store for themselves. Readable by the page (not
 * HttpOnly) because the banner decides whether to show from it before any
 * request. Holds only the choice and its date, nothing about the person.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ ok: false }, { status: 403 });

  let analytics: unknown;
  try {
    ({ analytics } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof analytics !== "boolean") return NextResponse.json({ ok: false }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONSENT_COOKIE, `${analytics ? "1" : "0"}.${new Date().toISOString()}`, preferenceCookieOptions(false));
  return res;
}
