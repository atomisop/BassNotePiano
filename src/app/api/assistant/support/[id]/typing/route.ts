import { NextResponse } from "next/server";
import { reportError } from "@/lib/reportError";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { setVisitorTyping } from "@/lib/support";

/**
 * The customer is typing in a live support thread. Same trust as the thread's other
 * routes: the unguessable thread id. A cheap upsert, called every couple of seconds
 * while the box is focused, and it never reveals anything about the thread.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    await setVisitorTyping(params.id, body?.typing !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError(err, "POST /api/assistant/support/[id]/typing failed");
    return NextResponse.json({ ok: false });
  }
}
