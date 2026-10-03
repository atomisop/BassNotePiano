import { NextResponse, type NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getAtomGreetingDismissCount, recordAtomGreetingDismissal, ATOM_GREETING_DISMISS_LIMIT } from "@/lib/assistant";
import { ATOM_DISMISS_COOKIE, isSameOriginJsonPost, preferenceCookieOptions } from "@/lib/preferenceCookies";

/**
 * How many times Atom's greeting bubble has been explicitly dismissed (its
 * X), so it stops appearing after ATOM_GREETING_DISMISS_LIMIT.
 *
 * One count, kept in two places:
 * - a one-year cookie on this device (set here by the server, so Safari's
 *   7-day wipe of page-written storage doesn't reset it), for everyone;
 * - the account's atomGreetingDismissCount when signed in, so the choice
 *   also follows the person to their other devices.
 * The bubble is suppressed when either one has reached the limit, so
 * dismissing it signed out and then signing in no longer starts over.
 *
 * Returns `suppressed` rather than the raw count so the client never needs
 * to know (or duplicate) the limit itself.
 */

function cookieCount(req: NextRequest): number {
  const n = Number(req.cookies.get(ATOM_DISMISS_COOKIE)?.value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), ATOM_GREETING_DISMISS_LIMIT) : 0;
}

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  const accountCount = session?.user ? await getAtomGreetingDismissCount(session.user.id) : 0;
  return NextResponse.json({ suppressed: Math.max(cookieCount(req), accountCount) >= ATOM_GREETING_DISMISS_LIMIT });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ suppressed: false }, { status: 403 });

  const session = await getServerAuthSession();
  const accountCount = session?.user ? await recordAtomGreetingDismissal(session.user.id) : 0;
  const deviceCount = Math.min(Math.max(cookieCount(req) + 1, accountCount), ATOM_GREETING_DISMISS_LIMIT);

  const res = NextResponse.json({ suppressed: Math.max(deviceCount, accountCount) >= ATOM_GREETING_DISMISS_LIMIT });
  res.cookies.set(ATOM_DISMISS_COOKIE, String(deviceCount), preferenceCookieOptions(true));
  return res;
}
