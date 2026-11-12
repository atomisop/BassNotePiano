import type { DefaultSession } from "next-auth";
import "next-auth/jwt";

// Augments the NextAuth JWT with the entitlement claims middleware needs to
// gate routes on the edge without a DB round trip. Populated in the `jwt`
// callback in src/lib/auth.ts, and refreshed there whenever a ZellePayment
// flips to VERIFIED or a ScaleProgress row is marked COMPLETED.
declare module "next-auth/jwt" {
  interface JWT {
    role: "STUDENT" | "ADMIN";
    hasCurriculumAccess: boolean;
    /** Slugs the user currently has access to (curriculum access, a legacy per-scale unlock, or an admin override). */
    unlockedScaleSlugs: string[];
    /** Slugs where the full read + practice + quiz checklist has been cleared. */
    completedScaleSlugs: string[];
    /** False until the post-registration onboarding wizard is completed, middleware redirects there until true. */
    onboarded: boolean;
    /** The User.sessionVersion this token was issued/refreshed against, see the jwt callback's "sign out other devices" comment. Optional: tokens issued before this field existed won't have it yet. */
    sessionVersion?: number;
    /** This one session's id, made at sign-in; a session the person signs out from the devices list is refused by id. Absent on tokens issued before it existed. */
    sid?: string;
  }
}

// Mirrors the same entitlement claims onto the client-visible `useSession()`
// shape, so dashboard/roadmap UI can read them without a separate fetch.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "STUDENT" | "ADMIN";
      hasCurriculumAccess: boolean;
      unlockedScaleSlugs: string[];
      completedScaleSlugs: string[];
      onboarded: boolean;
      sid?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: "STUDENT" | "ADMIN";
    hasCurriculumAccess: boolean;
    /** Set by authorize at sign-in so the token is right even if the entitlements query is slow. */
    onboarded?: boolean;
    /** Made by authorize for this sign-in; copied onto the token. */
    sid?: string;
  }
}
