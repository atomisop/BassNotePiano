import { noticeAccountChange } from "@/lib/studentNotices";
import { reportError } from "@/lib/reportError";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addToGuild } from "@/lib/discordApi";
import { checkState, DISCORD_STATE_COOKIE, fetchDiscordIdentity } from "@/lib/discordLink";

// Where Discord sends the student back after they connect.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.NEXTAUTH_URL ?? url.origin;
  const back = (flag: string) => {
    const res = NextResponse.redirect(new URL(`/lessons?discord=${flag}`, base));
    res.cookies.set(DISCORD_STATE_COOKIE, "", { maxAge: 0, path: "/api/discord" });
    return res;
  };

  const session = await getServerAuthSession();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login?callbackUrl=/lessons", base));

  const cookieNonce = req.headers.get("cookie")?.match(new RegExp(`${DISCORD_STATE_COOKIE}=([^;]+)`))?.[1];
  if (!checkState(url.searchParams.get("state"), cookieNonce, session.user.id)) return back("error");

  const code = url.searchParams.get("code");
  if (!code) return back("denied");

  try {
    const identity = await fetchDiscordIdentity(code);
    // One Discord account belongs to one student, so nobody can attach someone else's.
    const taken = await prisma.user.findFirst({ where: { discordId: identity.id, id: { not: session.user.id } }, select: { id: true } });
    if (taken) return back("taken");
    await prisma.user.update({ where: { id: session.user.id }, data: { discordId: identity.id, discordUsername: identity.username } });
    revalidatePath("/", "layout"); // every Connect / Disconnect button, the banner and the admin list now agree
    await noticeAccountChange(session.user.id, { kind: "discord-connected", name: identity.username });
    // Put them in the server too, so they never need an invite. If that cannot be done they can still use the Join button.
    const joined = await addToGuild(identity.id, identity.accessToken).catch(() => "failed" as const);
    return back(joined === "failed" ? "linked-nojoin" : "linked");
  } catch (err) {
    reportError(err, "Discord connect failed");
    return back("error");
  }
}
