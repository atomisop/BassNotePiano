import type { JWT } from "next-auth/jwt";

type SignInUser = { role?: "STUDENT" | "ADMIN"; hasCurriculumAccess?: boolean; name?: string | null; onboarded?: boolean };

/**
 * What the jwt callback does when the database did not answer in time, so the
 * entitlements are unknown. Returns the token to use, or null when there is
 * nothing trustworthy to go on (the caller then falls back to the
 * least-privilege defaults).
 *
 * Unknown must never be read as "not onboarded" for someone who already is,
 * that sends a finished account back to the onboarding wizard:
 * - a refresh keeps what the token already says;
 * - a fresh sign-in uses the user row `authorize` just read from the database.
 */
export function tokenWhenEntitlementsUnknown(token: JWT, user: SignInUser | undefined): JWT | null {
  if (typeof token.onboarded === "boolean") return token;
  if (user && typeof user.onboarded === "boolean") {
    token.role = user.role ?? "STUDENT";
    token.hasCurriculumAccess = Boolean(user.hasCurriculumAccess);
    token.unlockedScaleSlugs = token.unlockedScaleSlugs ?? [];
    token.completedScaleSlugs = token.completedScaleSlugs ?? [];
    token.name = user.name ?? null;
    token.onboarded = user.onboarded;
    return token;
  }
  return null;
}
