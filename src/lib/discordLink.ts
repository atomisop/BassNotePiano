import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DISCORD_CLIENT_ID } from "@/lib/discord";

// Connecting a student's Discord account. The student signs in with Discord and
// we only ask for who they are (the "identify" scope).

const STATE_COOKIE = "bnp_discord_state";

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is not set");
  return value;
}

function sign(nonce: string, userId: string): string {
  return createHmac("sha256", secret()).update(`discord-link:${nonce}:${userId}`).digest("hex").slice(0, 40);
}

export const DISCORD_STATE_COOKIE = STATE_COOKIE;

/** A fresh state value for one sign-in attempt, tied to the signed-in user and to a cookie. */
export function makeState(userId: string): { nonce: string; state: string } {
  const nonce = randomBytes(16).toString("hex");
  return { nonce, state: `${nonce}.${sign(nonce, userId)}` };
}

/** True only if the state came from this user, and matches the cookie set on the same browser. */
export function checkState(state: string | null, cookieNonce: string | undefined, userId: string): boolean {
  if (!state || !cookieNonce) return false;
  const [nonce, signature] = state.split(".");
  if (!nonce || !signature || nonce !== cookieNonce) return false;
  const expected = Buffer.from(sign(nonce, userId));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function redirectUri(): string {
  return `${process.env.NEXTAUTH_URL ?? ""}/api/discord/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    // identify: who they are. guilds.join: lets us add them to the server right after, so no invite link is needed.
    scope: "identify guilds.join",
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/** Trades the sign-in code for the person's Discord id and name, plus a short-lived token used once to add them to the server. */
export async function fetchDiscordIdentity(code: string): Promise<{ id: string; username: string; accessToken: string }> {
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientSecret) throw new Error("DISCORD_CLIENT_SECRET is not set");
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!tokenRes.ok) throw new Error(`Discord token exchange failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) throw new Error(`Discord identity lookup failed (${meRes.status})`);
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null };
  return { id: me.id, username: me.global_name ?? me.username, accessToken: access_token };
}
