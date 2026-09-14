import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// `User.image` is deliberately kept out of the JWT/session (see TopBar's own
// ProfileAvatarLink comment: it can be a multi-KB base64 data URI, too large
// for a session cookie), which is exactly right for a Server Component that
// can just query Prisma directly instead. MarketingNav can't do that, it's a
// client component (useSession, scroll listeners, the full-screen mobile
// menu), so this is its equivalent: a small authenticated GET a client
// component can fetch on mount, same photo TopBar already shows once signed
// in, just reachable from a place that never renders on the server. Fixes
// the profile icon on the homepage (and every other marketing page) always
// showing the name-initial fallback instead of a real photo.
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ image: null }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { image: true } });
  return NextResponse.json({ image: user?.image ?? null });
}
