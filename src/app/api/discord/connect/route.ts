import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { authorizeUrl, DISCORD_STATE_COOKIE, makeState } from "@/lib/discordLink";

// Sends the signed-in student to Discord to connect their account.
export async function GET(req: Request) {
  const session = await getServerAuthSession();
  const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login?callbackUrl=/lessons", base));

  const { nonce, state } = makeState(session.user.id);
  const target = authorizeUrl(state);
  // The browser button asks for the address as JSON so a phone or iPad can open it in the Discord app.
  const res = new URL(req.url).searchParams.get("format") === "json" ? NextResponse.json({ url: target }) : NextResponse.redirect(target);
  res.cookies.set(DISCORD_STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/discord" });
  return res;
}
