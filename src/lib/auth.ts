import { cache } from "react";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyCode } from "@/lib/verification";
import { assertRateLimit } from "@/lib/rateLimit";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { isFullAccess } from "@/lib/entitlementRules";

type Entitlements = {
  role: "STUDENT" | "ADMIN";
  hasCurriculumAccess: boolean;
  unlockedScaleSlugs: string[];
  completedScaleSlugs: string[];
  name: string | null;
  onboarded: boolean;
  sessionVersion: number;
};

/**
 * Sentinel for "the DB didn't answer in time (or the user row is gone),
 * skip the session-version check this pass" — never a real stored value
 * (the column defaults to 1). Every other field here falls back to a
 * least-privilege default on a timeout, but doing the same for
 * sessionVersion would mean a slow database round trip randomly signs
 * people out, which is a worse failure mode than briefly trusting a stale
 * version the way the role/access fields already do.
 */
const SESSION_VERSION_UNKNOWN = -1;

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
  sessionVersion: SESSION_VERSION_UNKNOWN,
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
  const [user, verifiedUnlocks, unlockedProgress, curriculumEntitlement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, hasCurriculumAccess: true, name: true, onboardedAt: true, sessionVersion: true },
    }),
    prisma.zellePayment.findMany({
      where: { userId, purpose: "SCALE_UNLOCK", status: "VERIFIED", scaleGroupId: { not: null } },
      select: { scaleGroup: { select: { slug: true } } },
    }),
    prisma.scaleProgress.findMany({
      where: { userId, unlockedAt: { not: null } },
      select: { status: true, scaleGroup: { select: { slug: true } } },
    }),
    getCurriculumEntitlement(userId),
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
    // Derived from an active Payment Plan (or admin/comped), not the stored
    // purchase flag. Display-only in the session: the edge no longer gates
    // scales off it, and every scale page and mutation re-checks the DB.
    hasCurriculumAccess: isFullAccess(curriculumEntitlement.kind),
    unlockedScaleSlugs,
    completedScaleSlugs,
    name: user?.name ?? null,
    onboarded: Boolean(user?.onboardedAt),
    sessionVersion: user?.sessionVersion ?? SESSION_VERSION_UNKNOWN,
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
  // maxAge (not just the strategy) is deliberate: edge middleware decodes
  // the JWT with next-auth/jwt's getToken(), which never runs the jwt
  // callback below — so a token that was force-signed-out (sessionVersion
  // bumped) or otherwise invalidated keeps being trusted at the edge for as
  // long as the cookie itself is valid, regardless of what the callback
  // would say. NextAuth's own default is 30 days; 7 bounds how long that
  // mismatch window can last for an action like "sign this person out" that
  // should feel close to immediate. updateAge (default 24h) still silently
  // rolls this forward on every active day, so a real, still-signed-in user
  // never notices — only an idle or force-signed-out session ever hits the
  // cap. Actually making the edge check DB-fresh would mean every gated
  // request on the whole site pays a database round trip just to cover this
  // rare admin action, a worse trade than a bounded staleness window.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
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

        // Guess limit for the code itself. Codes used to be issued only after a
        // correct password and never left the server, so this could not be
        // reached without one. "Email me a code" now emails a code to anyone who
        // asks for it, so signing in with a code must lock out like a password
        // does: the same failed-attempt log and limits as loginStepOneAction
        // (8 in 15 minutes per email), plus verifyCode's own 5 guesses per code.
        const normalizedEmail = credentials.email.trim().toLowerCase();
        try {
          await assertRateLimit(
            prisma.failedLoginAttempt.count,
            { email: normalizedEmail },
            { windowMinutes: 15, max: 8, message: "locked" },
          );
        } catch {
          return null;
        }

        const result = await verifyCode(normalizedEmail, "LOGIN_2FA", credentials.code);
        if (!result.ok || !result.userId) {
          await prisma.failedLoginAttempt.create({ data: { email: normalizedEmail } }).catch(() => undefined);
          return null;
        }

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
    async jwt({ token, user, trigger }) {
      if (!token.sub) return token;

      const entitlements = await loadEntitlementsBounded(token.sub);

      // Real "sign out other devices" enforcement, not just the UI copy
      // claiming it: every already-open session's token carries whatever
      // version was current at ITS OWN sign-in. A password change or the
      // explicit "sign out of all other devices" action bumps the column,
      // so the next time any of those other tokens touch this callback,
      // the comparison below fails and returning `{}` drops it (no `sub`,
      // so getServerAuthSession/useSession see it as logged out).
      if (entitlements.sessionVersion !== SESSION_VERSION_UNKNOWN) {
        if (user || trigger === "update") {
          // Fresh sign-in, or this exact device just called update()
          // right after triggering the bump itself — bake in the current
          // version so the device that DID the bump doesn't sign itself
          // out too.
          token.sessionVersion = entitlements.sessionVersion;
        } else if (typeof token.sessionVersion !== "number") {
          // A token issued before this field existed. Adopt the current
          // version rather than treating "never had one" as a mismatch —
          // otherwise shipping this signs out every already-open session
          // app-wide the moment it deploys.
          token.sessionVersion = entitlements.sessionVersion;
        } else if (token.sessionVersion !== entitlements.sessionVersion) {
          // Deliberately not a real JWT — the cast is the intentional part.
          // getServerAuthSession/useSession/middleware all key off `sub`
          // being present, not off matching this type's shape, so an empty
          // object correctly reads as "no session" everywhere it's checked.
          return {} as JWT;
        }
      }

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
 *
 * `session.user.id` missing is itself one of those dead-session cases, not
 * just "skip the DB check": it happens whenever the jwt callback's own
 * sessionVersion mismatch fires (force sign-out, password change elsewhere)
 * and returns `{}`, since NextAuth still builds a `session.user` object from
 * that empty token's undefined name/email/image before this ever runs. That
 * object is truthy, just with no `.id` on it, so returning it unchanged
 * (as this used to) left `!session?.user` false everywhere downstream, and
 * every page that went on to query `prisma.user.findUnique({ where: { id:
 * session.user.id } })` passed `id: undefined` and crashed. Returning null
 * here instead is what actually makes that first guard fire.
 */
export const getServerAuthSession = cache(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const exists = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  return exists ? session : null;
});
