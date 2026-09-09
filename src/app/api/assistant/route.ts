import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { askAssistant, assertAssistantRateLimit, appendPersistedMessages, RateLimitError, type AssistantMessage } from "@/lib/assistant";

const MAX_MESSAGES = 20; // caps both cost and the prompt's own size
const MAX_MESSAGE_LENGTH = 2000;

/**
 * A real route handler, not a Server Action — the widget is reachable from
 * the public marketing pages with no session, and Server Actions always run
 * as POSTs to the current page's own route, which would tie this to
 * whatever page happened to render it. A plain fetchable endpoint is the
 * simpler contract for a client component that has to work identically on
 * every page in the app.
 *
 * Wrapped in one outer try/catch — this route didn't have one, unlike its
 * sibling /api/assistant/escalate (see that route's own comment for the
 * reasoning, which applies just as much here, if not more: this is the
 * everyday chat endpoint, not just the rarer handoff). Without it, anything
 * unexpected below (a transient Gemini API hiccup, a momentary Postgres
 * connection drop, an auth misconfiguration) crashed as a bare, un-JSON'd
 * 500 with no `error` field — which the widget has no way to distinguish
 * from "the network dropped," so it fell back to its own generic "Something
 * went wrong" text instead of anything actually informative. Caught live
 * during a manual check of the widget end-to-end.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rawHistory = Array.isArray(body?.messages) ? body.messages : null;
    if (!rawHistory || rawHistory.length === 0) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    const history: AssistantMessage[] = rawHistory
      .slice(-MAX_MESSAGES)
      .filter(
        (m: unknown): m is AssistantMessage =>
          typeof m === "object" &&
          m !== null &&
          (("role" in m && (m as { role: unknown }).role === "user") || (m as { role: unknown }).role === "assistant") &&
          typeof (m as { content: unknown }).content === "string",
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    const session = await getServerAuthSession();

    // IP-based limiting only matters for the anonymous case — a signed-in
    // visitor is already keyed by their own account, which is a stronger,
    // more accountable identifier than whatever IP a shared network puts them
    // behind.
    const identifier = session?.user
      ? `user:${session.user.id}`
      : (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    try {
      await assertAssistantRateLimit(identifier, Boolean(session?.user));
    } catch (err) {
      if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
      throw err;
    }

    let classCredits: number | null = null;
    if (session?.user) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { classCredits: true } });
      classCredits = user?.classCredits ?? null;
    }

    const reply = await askAssistant(history, {
      signedIn: Boolean(session?.user),
      name: session?.user?.name ?? null,
      hasCurriculumAccess: Boolean(session?.user?.hasCurriculumAccess),
      classCredits,
      isAdmin: session?.user?.role === "ADMIN",
    });

    // Persisted only for a signed-in visitor (see appendPersistedMessages'
    // own doc comment for why) — the widget already sent its full local
    // transcript above for the model's own context; this is a separate,
    // server-side append of just the one new exchange, not a re-save of
    // everything the client happened to send.
    if (session?.user) {
      const lastUserMessage = history[history.length - 1].content;
      await appendPersistedMessages(session.user.id, lastUserMessage, reply).catch((err) =>
        console.error("Failed to persist Atom history (non-blocking):", err),
      );
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("POST /api/assistant failed:", err);
    return NextResponse.json({ error: "Something went wrong — try again in a moment." }, { status: 500 });
  }
}
