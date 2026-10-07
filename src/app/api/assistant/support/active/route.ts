import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lets a signed-in visitor's widget re-find their own support thread on a
 * fresh page load without needing sessionStorage to have survived (it
 * often won't — sessionStorage clears on tab close). Signed-in only: an
 * anonymous visitor has no account to look this up by, and stays scoped to
 * whatever their browser still remembers, same as the rest of the widget's
 * pre-escalation history.
 *
 * status: "OPEN" only. This used to return the visitor's most recent
 * escalation regardless of status, so once an admin resolved it, the
 * widget's "start a new conversation" reset (which clears activeEscalationId
 * to go back to plain Atom chat) got immediately undone: this endpoint kept
 * finding that same resolved thread and re-attaching it, since it's still
 * "most recent." A resolved thread isn't active by definition — only an
 * OPEN one should ever be re-offered here.
 */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ escalationId: null });

  const escalation = await prisma.assistantEscalation.findFirst({
    where: { userId: session.user.id, status: "OPEN", source: "CHAT" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({ escalationId: escalation?.id ?? null });
}
