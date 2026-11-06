import { cookies } from "next/headers";
import { SESSION_PROOF_COOKIE, SESSION_PROOF_MAX_AGE_S, makeSessionProof } from "@/lib/sessionProof";

/** Called by an action right after it bumps the session version, so this browser can re-stamp its own session. */
export async function leaveSessionProof(userId: string, version: number): Promise<void> {
  const value = makeSessionProof(userId, version);
  if (!value) return;
  (await cookies()).set(SESSION_PROOF_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_PROOF_MAX_AGE_S,
  });
}

/** Read inside the jwt callback; null when there is no request context or no cookie. */
export async function readSessionProof(): Promise<string | null> {
  try {
    return (await cookies()).get(SESSION_PROOF_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
