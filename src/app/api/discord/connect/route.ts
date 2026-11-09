import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { authorizeUrl, DISCORD_STATE_COOKIE, makeState } from "@/lib/discordLink";
import { discordReturnPath } from "@/lib/inPlaceLinks";

// Sends the signed-in student to Discord to connect their account. They come back to the page they connected from
// (?return=, else the page the button was on), checked to be a plain in-app path and signed into the state.
export async function GET(req: Request) {
  const session = await getServerAuthSession();
  const url = new URL(req.url);
  const base = process.env.NEXTAUTH_URL ?? url.origin;
  const returnTo = discordReturnPath(url.searchParams.get("return"), req.headers.get("referer"), new URL(base).origin);
  if (!session?.user?.id) return NextResponse.redirect(new URL(`/login?${new URLSearchParams({ callbackUrl: returnTo })}`, base));

  const { nonce, state } = makeState(session.user.id, returnTo);
  const target = authorizeUrl(state);
  // The browser button asks for the address as JSON so a phone or iPad can open it in the Discord app.
  const res = url.searchParams.get("format") === "json" ? NextResponse.json({ url: target }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.redirect(target);
  res.cookies.set(DISCORD_STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/discord" });
  return res;
}
