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
    /** False until the post-registration onboarding wizard is completed — middleware redirects there until true. */
    onboarded: boolean;
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
    } & DefaultSession["user"];
  }

  interface User {
    role: "STUDENT" | "ADMIN";
    hasCurriculumAccess: boolean;
  }
}
