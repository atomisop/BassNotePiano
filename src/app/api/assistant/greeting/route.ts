import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getAtomGreetingDismissCount, recordAtomGreetingDismissal, ATOM_GREETING_DISMISS_LIMIT } from "@/lib/assistant";

/**
 * Tracks how many times a signed-in account has explicitly dismissed Atom's
 * own greeting bubble. See the atomGreetingDismissCount column's own
 * comment on the User model and AssistantWidget's dismissGreeting(). Only
 * ever called for a signed-in session; an anonymous visitor has no account
 * to persist this on, so the widget falls back to a localStorage counter
 * for everyone else and never hits this route at all.
 *
 * Returns `suppressed` rather than the raw count so the client never needs
 * to know (or duplicate) ATOM_GREETING_DISMISS_LIMIT itself.
 */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ suppressed: false });
  const dismissCount = await getAtomGreetingDismissCount(session.user.id);
  return NextResponse.json({ suppressed: dismissCount >= ATOM_GREETING_DISMISS_LIMIT });
}

export async function POST() {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ suppressed: false });
  const dismissCount = await recordAtomGreetingDismissal(session.user.id);
  return NextResponse.json({ suppressed: dismissCount >= ATOM_GREETING_DISMISS_LIMIT });
}
