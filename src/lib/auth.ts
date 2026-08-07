import { cache } from "react";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyCode } from "@/lib/verification";

type Entitlements = {
  role: "STUDENT" | "ADMIN";
  hasCurriculumAccess: boolean;
  unlockedScaleSlugs: string[];
  completedScaleSlugs: string[];
  name: string | null;
  onboarded: boolean;
};

// Fallback used only if loadEntitlements() itself doesn't come back in time
// (see loadEntitlementsBounded below) — least-privilege defaults, since a
// degraded session should never accidentally grant more access than the DB
// actually confirms. Self-corrects on the next jwt callback run once the DB
// responds normally again. `onboarded: false` for the same reason — worst
// case a briefly-slow DB re-shows the wizard to someone who already
// finished it, which is harmless; defaulting the other way could let a
// genuinely new user skip mandatory onboarding entirely on unlucky timing.
const DEFAULT_ENTITLEMENTS: Entitlements = {
  role: "STUDENT",
  hasCurriculumAccess: false,
  unlockedScaleSlugs: [],
  completedScaleSlugs: [],
  name: null,
  onboarded: false,
};

// Single source of truth for "what can this user see" — read by the jwt
// callback below so it can be baked into the session token. Unlock comes
// from two independent places: a verified legacy per-scale Zelle payment
// (Pay-As-You-Go, no longer purchasable but still honored for grandfathered
// rows), or a ScaleProgress row that already has unlockedAt set (covers
// curriculum-access grants and admin overrides, which stamp that field
// directly rather than creating a ZellePayment).
//
// Deliberately does NOT select `image` — that column can hold a multi-KB
// base64 data URI (the account settings avatar upload stores photos that
// way), and JWT session strategy puts everything here directly into a
// browser cookie. An oversized cookie gets silently dropped by the browser
// or rejected by an intermediate proxy, which look identical to "login
// hangs forever" from the client's perspective — this actually happened in
// production. Anywhere that needs the real image fetches it directly from
// the DB instead (see the /account page), never through the session.
async function loadEntitlements(userId: string): Promise<Entitlements> {
  const [user, verifiedUnlocks, unlockedProgress] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, hasCurriculumAccess: true, name: true, onboardedAt: true },
    }),
    prisma.zellePayment.findMany({
      where: { userId, purpose: "SCALE_UNLOCK", status: "VERIFIED", scaleGroupId: { not: null } },
      select: { scaleGroup: { select: { slug: true } } },
    }),
    prisma.scaleProgress.findMany({
      where: { userId, unlockedAt: { not: null } },
      select: { status: true, scaleGroup: { select: { slug: true } } },
    }),
  ]);

  const unlockedScaleSlugs = Array.from(
    new Set([
      ...verifiedUnlocks.map((p) => p.scaleGroup!.slug),
      ...unlockedProgress.map((p) => p.scaleGroup.slug),
    ]),
  );

  const completedScaleSlugs = unlockedProgress
    .filter((p) => p.status === "COMPLETED")
    .map((p) => p.scaleGroup.slug);

  return {
    role: user?.role ?? "STUDENT",
    hasCurriculumAccess: user?.hasCurriculumAccess ?? false,
    unlockedScaleSlugs,
    completedScaleSlugs,
    name: user?.name ?? null,
    onboarded: Boolean(user?.onboardedAt),
  };
}

// The jwt callback below runs synchronously in the login response path (and
// on every subsequent session touch) — a slow Postgres round trip here
// would otherwise block a login that already passed the real credential
// check, so it gets a hard cap rather than being trusted to always be fast.
async function loadEntitlementsBounded(userId: string): Promise<Entitlements> {
  return Promise.race([
    loadEntitlements(userId),
    new Promise<Entitlements>((resolve) => setTimeout(() => resolve(DEFAULT_ENTITLEMENTS), 3000)),
  ]).catch((err) => {
    console.error("loadEntitlements failed, using defaults for this session:", err);
    return DEFAULT_ENTITLEMENTS;
  });
}

export const authOptions: NextAuthOptions = {
  // Kept even though Credentials forces JWT sessions — it still owns the
  // Account/Session/VerificationToken tables for any OAuth provider added
  // later (e.g. Google sign-in) alongside email/password.
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // Deliberately password-less: this only ever checks a LOGIN_2FA code,
    // never a password directly. Password verification happens entirely in
    // the loginStepOneAction Server Action (src/app/(auth)/login/actions.ts),
    // which — on success — silently issues a code server-side (never
    // emailed) and hands it straight back to the client, which immediately
    // calls signIn with it. Splitting it this way means this is the *only*
    // path that ever establishes a session, so this can't be bypassed by
    // calling signIn() directly with just a password. The code itself is
    // invisible to the user (see loginStepOneAction) — this indirection
    // exists purely to keep a single credential-checking entry point, not to
    // actually require a second factor at login anymore.
    CredentialsProvider({
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.code) return null;

        const result = await verifyCode(credentials.email, "LOGIN_2FA", credentials.code);
        if (!result.ok || !result.userId) return null;

        const user = await prisma.user.findUnique({ where: { id: result.userId } });
        if (!user) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          hasCurriculumAccess: user.hasCurriculumAccess,
        };
      },
    }),
  ],
  callbacks: {
    // Runs on sign-in and on every subsequent session touch (useSession()
    // polling, getServerSession(), or an explicit client update() call after
    // a payment gets verified / a quiz gets passed). Edge middleware only
    // ever decodes the resulting cookie — it can't hit Postgres itself — so
    // this callback is the only place entitlements get re-derived from the
    // DB, and how often it runs is the whole staleness budget for gating.
    async jwt({ token }) {
      if (!token.sub) return token;

      const entitlements = await loadEntitlementsBounded(token.sub);
      token.role = entitlements.role;
      token.hasCurriculumAccess = entitlements.hasCurriculumAccess;
      token.unlockedScaleSlugs = entitlements.unlockedScaleSlugs;
      token.completedScaleSlugs = entitlements.completedScaleSlugs;
      token.name = entitlements.name;
      token.onboarded = entitlements.onboarded;

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.name = token.name ?? null;
        session.user.role = token.role;
        session.user.hasCurriculumAccess = token.hasCurriculumAccess;
        session.user.unlockedScaleSlugs = token.unlockedScaleSlugs;
        session.user.completedScaleSlugs = token.completedScaleSlugs;
        session.user.onboarded = token.onboarded;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Server-side session accessor for route handlers, server actions, and RSCs.
 * Wrapped in React's cache() so the (dashboard) layout and the pages it
 * wraps — which each need the session independently — share one lookup per
 * request instead of re-decoding the JWT repeatedly.
 *
 * Also the one place that guards against a stale session: a browser can
 * hold a valid, signed JWT for a user row that no longer exists (deleted
 * directly in the DB, a wiped test account, etc). loadEntitlements() can't
 * tell that apart from "brand new user with no entitlements yet," so it
 * silently returns defaults — every other caller in the app trusts
 * `session.user.id` as a real foreign key, which crashes the moment it's
 * used in a write (or a findUniqueOrThrow read). Checking existence here
 * means every existing `if (!session?.user) redirect(...)` guard across the
 * app correctly treats a dead session as logged-out, with nothing else to change.
 */
export const getServerAuthSession = cache(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return session;

  const exists = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  return exists ? session : null;
});
