import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { getMeStatus } from "@/lib/meStatus";

export const dynamic = "force-dynamic";

/** The signed-in person's live status (credits, Discord, practice). Polled by MeStatusProvider; never cached. */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(await getMeStatus(session.user.id), { headers: { "Cache-Control": "no-store" } });
}
