/**
 * Server-side check of a Cloudflare Turnstile token. Skipped only outside
 * production when TURNSTILE_SECRET_KEY is unset; otherwise a missing or
 * invalid token is rejected.
 *
 * Also requires the token to have been issued for `expectedAction` (so a
 * token solved on one form can't be replayed on another) and, when
 * TURNSTILE_HOSTNAMES is set (comma-separated), for one of our hostnames.
 */
export async function verifyTurnstile(token: unknown, expectedAction: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Local dev without keys skips the check; production fails closed, so a
  // missing or misnamed env var blocks the form instead of silently
  // disabling the CAPTCHA while the widget still shows.
  if (!secret) return process.env.NODE_ENV !== "production";
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
    if (data.success !== true || data.action !== expectedAction) return false;
    const hostnames = (process.env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return hostnames.length === 0 || (typeof data.hostname === "string" && hostnames.includes(data.hostname));
  } catch {
    return false;
  }
}
