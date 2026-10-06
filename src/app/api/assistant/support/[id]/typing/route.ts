import { NextResponse } from "next/server";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { setSupportTyping } from "@/lib/support";

/**
 * The customer is typing in a live support thread. Same trust as the thread's other
 * routes: the unguessable thread id. A cheap upsert, called every couple of seconds
 * while the box is focused, and it never reveals anything about the thread.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    await setSupportTyping(params.id, "VISITOR", body?.typing !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/assistant/support/[id]/typing failed:", err);
    return NextResponse.json({ ok: false });
  }
}
