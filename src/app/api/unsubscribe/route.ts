import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PREFERENCE_COLUMN } from "@/lib/emailPreferences";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Turns one email switch off for the person a signed link was made for. POST only: a link that changed something on GET would be
 * triggered by mail scanners that open every link. Two callers: a mail app's one-click "Unsubscribe" (RFC 8058, body
 * "List-Unsubscribe=One-Click", answered with a plain 200), and the confirmation page's button (field "from=page", answered with a
 * redirect back to that page).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let form: URLSearchParams | null = null;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    form = null;
  }
  const get = (name: string) => url.searchParams.get(name) ?? form?.get(name) ?? "";
  const userId = get("u");
  const category = get("c");
  const token = get("t");
  const fromPage = form?.get("from") === "page";

  if (!verifyUnsubscribeToken(userId, category, token)) {
    return fromPage
      ? NextResponse.redirect(new URL("/unsubscribe?bad=1", request.url), 303)
      : NextResponse.json({ error: "This link is not valid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const column = PREFERENCE_COLUMN[category as keyof typeof PREFERENCE_COLUMN];
  // updateMany: a person who has since deleted their account is simply not found, and that is not an error for them.
  const result = await prisma.user.updateMany({ where: { id: userId }, data: { [column]: false } });
  if (result.count > 0) {
    await logAudit({ actorId: userId, actorEmail: null, action: "email.unsubscribe", targetType: "User", targetId: userId, detail: category }).catch(() => undefined);
  }

  if (fromPage) {
    const done = new URL("/unsubscribe", request.url);
    done.searchParams.set("done", category);
    // Carried so the confirmation page can prove the link and point at THIS person's settings (not whoever is signed in).
    done.searchParams.set("u", userId);
    done.searchParams.set("t", token);
    return NextResponse.redirect(done, 303);
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
