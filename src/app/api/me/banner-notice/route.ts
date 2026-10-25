import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { isBannerKind, recordBannerNotice } from "@/lib/bannerNotices";

export const dynamic = "force-dynamic";

/** The browser tells us a banner just popped up: keep the reminder in the person's notifications. */
export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; slot?: unknown } | null;
  if (!body || !isBannerKind(body.kind) || typeof body.slot !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const result = await recordBannerNotice(session.user.id, body.kind, body.slot);
  return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
}
