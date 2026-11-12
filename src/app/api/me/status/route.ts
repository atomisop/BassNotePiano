import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { placeFromHeaders, touchDevice } from "@/lib/deviceAlerts";
import { getServerAuthSession } from "@/lib/auth";
import { getMeStatus } from "@/lib/meStatus";

export const dynamic = "force-dynamic";

/** The signed-in person's live status (credits, Discord, practice). Polled by MeStatusProvider; never cached. */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  // This tab being open is what makes its device show as active under Settings > Where you are signed in.
  const h = await headers();
  await touchDevice(session.user.id, h.get("user-agent"), placeFromHeaders(h), session.user.sid);
  return NextResponse.json(await getMeStatus(session.user.id), { headers: { "Cache-Control": "no-store" } });
}
