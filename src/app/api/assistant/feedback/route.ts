import { NextResponse } from "next/server";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { headers } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { submitAssistantFeedback, type FeedbackRating } from "@/lib/assistantFeedback";
import { RateLimitError } from "@/lib/rateLimit";

const MAX_MESSAGE_LENGTH = 4000;

function isRating(value: unknown): value is FeedbackRating {
  return value === "UP" || value === "DOWN";
}

/**
 * Records a thumbs up/down on one Atom reply. Public — same reachability as
 * /api/assistant itself (the widget works with no login) — so this is
 * rate-limited by the same identifier convention rather than requiring auth.
 * The widget itself treats this as best-effort and swallows failures, but
 * it's still wrapped so an unexpected error is logged server-side rather
 * than crashing silently with nothing to grep for later.
 */
export async function POST(req: Request) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    const rating = body?.rating;
    const messageContent = body?.messageContent;

    if (!isRating(rating) || typeof messageContent !== "string" || !messageContent.trim()) {
      return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
    }

    const session = await getServerAuthSession();
    const identifier = session?.user
      ? `user:${session.user.id}`
      : (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    try {
      await submitAssistantFeedback({
        identifier,
        userId: session?.user?.id ?? null,
        rating,
        messageContent: messageContent.slice(0, MAX_MESSAGE_LENGTH),
      });
    } catch (err) {
      if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/assistant/feedback failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
