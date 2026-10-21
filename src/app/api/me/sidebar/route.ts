import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { getSidebarCards } from "@/lib/sidebarCards";

export const dynamic = "force-dynamic";

/** The cards in the desktop sidebar's bottom slot (see src/lib/sidebarCards.ts). Polled by SidebarSpotlight; never cached. */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const isAdmin = session.user.role === "ADMIN";
  const cards = await getSidebarCards(session.user.id, session.user.role ?? "STUDENT", isAdmin && isOwnerEmail(session.user.email));
  return NextResponse.json({ cards }, { headers: { "Cache-Control": "no-store" } });
}
