import { createHmac, timingSafeEqual } from "crypto";

/**
 * Proof that THIS browser just bumped the account's session version (a password change, an email change, or "sign out other devices").
 *
 * The bump makes every other open session's cookie stale. The browser that did the bump then calls next-auth's update() to re-stamp its
 * own cookie. next-auth lets anyone holding a signed cookie call update(), so without this proof a copied (stale) cookie could re-stamp
 * itself and undo the sign-out. The action leaves this short-lived, HttpOnly cookie in the acting browser only; the jwt callback re-stamps
 * a stale token only when it carries a valid proof for that account and the CURRENT version.
 */
export const SESSION_PROOF_COOKIE = "bnp-sv-proof";
export const SESSION_PROOF_MAX_AGE_S = 120;

function sign(userId: string, version: number, expiresAtMs: number): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`session-proof-v1:${userId}:${version}:${expiresAtMs}`).digest("hex");
}

export function makeSessionProof(userId: string, version: number, nowMs: number = Date.now()): string | null {
  const expiresAtMs = nowMs + SESSION_PROOF_MAX_AGE_S * 1000;
  const mac = sign(userId, version, expiresAtMs);
  return mac ? `${expiresAtMs}.${mac}` : null;
}

export function isValidSessionProof(value: string | null | undefined, userId: string, version: number, nowMs: number = Date.now()): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const expiresAtMs = Number(value.slice(0, dot));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < nowMs) return false;
  const expected = sign(userId, version, expiresAtMs);
  if (!expected) return false;
  const given = Buffer.from(value.slice(dot + 1));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}
