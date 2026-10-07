import { NextResponse } from "next/server";
import { isSameOriginJsonPost } from "@/lib/preferenceCookies";
import { headers } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { createAssistantEscalation, AssistantEscalationError } from "@/lib/support";
import type { AssistantMessage } from "@/lib/assistant";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTACT_NAME_LENGTH = 200;
const MAX_CONTACT_EMAIL_LENGTH = 320; // RFC 5321 max
// A handoff is a much rarer action than an ordinary chat turn, this just
// stops a scripted client from flooding the admin notification inbox.
const ESCALATION_LIMIT = { windowMinutes: 60, max: 3 };

/**
 * Hands an Atom conversation off to a human. Reachable with no login (the
 * widget is public), so an anonymous visitor must supply a contact email in
 * the body; a signed-in visitor's account email/name is used instead and
 * can't be overridden by the request body.
 *
 * Wrapped in one outer try/catch so any unexpected failure here (a
 * migration that hasn't landed on the running database yet, a transient
 * Postgres hiccup, ...) always comes back as a clean, honest JSON error
 * instead of an unhandled 500, the widget has no other way to tell a real
 * "couldn't reach a human" apart from "the server choked," and a visitor
 * asking for help is exactly the wrong moment to hand them either a raw
 * crash or client-side JSON parsing.
 */
export async function POST(req: Request) {
  if (!isSameOriginJsonPost(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    const rawHistory = Array.isArray(body?.messages) ? body.messages : null;
    if (!rawHistory) {
      return NextResponse.json({ error: "No conversation to send." }, { status: 400 });
    }

    const transcript: AssistantMessage[] = rawHistory
      .slice(-MAX_MESSAGES)
      .filter(
        (m: unknown): m is AssistantMessage =>
          typeof m === "object" &&
          m !== null &&
          ((m as { role: unknown }).role === "user" || (m as { role: unknown }).role === "assistant") &&
          typeof (m as { content: unknown }).content === "string",
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

    const session = await getServerAuthSession();
    const identifier = session?.user
      ? `user:${session.user.id}`
      : (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    try {
      await assertRateLimit(
        prisma.assistantEscalation.count,
        { identifier },
        { ...ESCALATION_LIMIT, message: "You've already reached out. Our team will follow up soon." },
      );
    } catch (err) {
      if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
      throw err;
    }

    let userId: string | null = null;
    let contactEmail: string | null = null;
    let contactName: string | null = null;

    if (session?.user) {
      userId = session.user.id;
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, name: true, username: true } });
      contactEmail = user?.email ?? null;
      // A signed-in visitor is always shown by their real identity, never as an anonymous visitor.
      contactName = user?.name ?? user?.username ?? null;
    } else {
      contactEmail = typeof body?.contactEmail === "string" ? body.contactEmail.slice(0, MAX_CONTACT_EMAIL_LENGTH) : null;
      contactName = typeof body?.contactName === "string" ? body.contactName.slice(0, MAX_CONTACT_NAME_LENGTH) : null;
    }

    if (!contactEmail) {
      return NextResponse.json({ error: "An email address is needed so our team can follow up." }, { status: 400 });
    }

    let escalationId: string;
    try {
      const escalation = await createAssistantEscalation({ identifier, userId, contactName, contactEmail, transcript });
      escalationId = escalation.id;
    } catch (err) {
      if (err instanceof AssistantEscalationError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }

    return NextResponse.json({ ok: true, escalationId });
  } catch (err) {
    console.error("POST /api/assistant/escalate failed:", err);
    return NextResponse.json(
      { error: "Something went wrong sending this to our team. Please try again, or message the studio directly." },
      { status: 500 },
    );
  }
}
