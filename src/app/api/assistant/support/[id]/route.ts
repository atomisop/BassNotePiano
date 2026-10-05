import { NextResponse } from "next/server";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { headers } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { getThreadForVisitor, postVisitorMessage, AssistantEscalationError } from "@/lib/support";

const MAX_MESSAGE_LENGTH = 2000;
// A live back-and-forth is a much faster cadence than the initial handoff,
// but still a real person typing, not a script — generous enough for a
// genuine conversation, tight enough to stop a loop hammering the endpoint.
const SEND_LIMIT = { windowMinutes: 10, max: 30 };

function resolveIdentifier(userId: string | undefined, forwardedFor: string | null): string {
  return userId ? `user:${userId}` : forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}

/** Polls a support thread's live messages — the widget calls this on an interval while a handoff is active. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const thread = await getThreadForVisitor(params.id);
    if (!thread) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(thread);
  } catch (err) {
    console.error("GET /api/assistant/support/[id] failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/** Sends a visitor's follow-up message into an already-created support thread. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    const message = body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
    }

    const session = await getServerAuthSession();
    const identifier = resolveIdentifier(session?.user?.id, (await headers()).get("x-forwarded-for"));

    try {
      await assertRateLimit(
        prisma.supportMessage.count,
        { identifier, sender: "VISITOR" },
        { ...SEND_LIMIT, message: "You're sending messages too fast. Please slow down." },
      );
    } catch (err) {
      if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
      throw err;
    }

    try {
      const thread = await postVisitorMessage(params.id, identifier, message.slice(0, MAX_MESSAGE_LENGTH));
      if (!thread) return NextResponse.json({ error: "Not found." }, { status: 404 });
      return NextResponse.json(thread);
    } catch (err) {
      if (err instanceof AssistantEscalationError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  } catch (err) {
    console.error("POST /api/assistant/support/[id] failed:", err);
    return NextResponse.json({ error: "Something went wrong sending that. Please try again." }, { status: 500 });
  }
}
