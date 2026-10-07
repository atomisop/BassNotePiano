import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { loadPersistedHistory } from "@/lib/assistant";

/**
 * The widget calls this once on mount for a signed-in visitor, to seed its
 * local conversation state from what's actually stored server-side (see
 * loadPersistedHistory's own doc comment), an anonymous visitor never has
 * anything here to fetch, so the widget skips calling this at all for them.
 */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ messages: [] });

  const messages = await loadPersistedHistory(session.user.id);
  return NextResponse.json({ messages });
}
