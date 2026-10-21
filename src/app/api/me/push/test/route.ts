import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/webPush";

export const dynamic = "force-dynamic";

/** "Send me a test": one push to the signed-in person's own browsers, a few times an hour at most. */
export async function POST() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    await consumeRateLimit(prisma, `push-test:${session.user.id}`, { windowMinutes: 60, max: 5, message: "Too many tests. Try again later." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Too many tests." }, { status: 429 });
  }
  const delivered = await sendPushToUser(session.user.id, { title: "Bass Note Piano", body: "Reminders will show up like this.", url: "/account" });
  return NextResponse.json({ delivered });
}
