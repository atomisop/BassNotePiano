import { NextResponse } from "next/server";
import { reportError } from "@/lib/reportError";
import { clientAddress } from "@/lib/assistantInput";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { headers } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertSuggestionRateLimit,
  generateSuggestions,
  RateLimitError,
  type AssistantMessage,
} from "@/lib/assistant";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Predicted follow-up questions for Atom's suggestion chips, called by the
 * widget right after each answer. Never fails loudly: anything wrong just
 * returns an empty list and the widget falls back to its built-in chips.
 */
export async function POST(req: Request) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    const raw = Array.isArray(body?.messages) ? body.messages : null;
    if (!raw || raw.length === 0) return NextResponse.json({ suggestions: [] });

    const history: AssistantMessage[] = raw
      .slice(-MAX_MESSAGES)
      .filter(
        (m: unknown): m is AssistantMessage =>
          typeof m === "object" &&
          m !== null &&
          ((m as { role: unknown }).role === "user" || (m as { role: unknown }).role === "assistant") &&
          typeof (m as { content: unknown }).content === "string",
      )
      .map((m: AssistantMessage) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

    const session = await getServerAuthSession();
    const identifier = session?.user
      ? `user:${session.user.id}`
      : (clientAddress(await headers()));

    try {
      await assertSuggestionRateLimit(identifier, Boolean(session?.user));
    } catch (err) {
      if (err instanceof RateLimitError) return NextResponse.json({ suggestions: [] });
      throw err;
    }

    let classCredits: number | null = null;
    if (session?.user) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { classCredits: true } });
      classCredits = user?.classCredits ?? null;
    }

    const suggestions = await generateSuggestions(history, {
      signedIn: Boolean(session?.user),
      name: session?.user?.name ?? null,
      hasCurriculumAccess: Boolean(session?.user?.hasCurriculumAccess),
      classCredits,
      isAdmin: session?.user?.role === "ADMIN",
    });
    return NextResponse.json({ suggestions });
  } catch (err) {
    reportError(err, "POST /api/assistant/suggestions failed");
    return NextResponse.json({ suggestions: [] });
  }
}
