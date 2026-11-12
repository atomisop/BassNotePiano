import { PAYMENT_LOCKED_CODE } from "@/lib/paymentLockCodes";
import { BANNED_ERROR_CODE } from "@/lib/ban";
import { cache } from "react";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyCode } from "@/lib/verification";
import { getCurriculumEntitlement } from "@/lib/entitlement";
import { isFullAccess } from "@/lib/entitlementRules";
import { tokenWhenEntitlementsUnknown } from "@/lib/tokenFallback";
import { consumeSecondStep } from "@/lib/adminTwoStep";
import { placeFromHeaders, recordSignInDevice, isDeviceSignedOut } from "@/lib/deviceAlerts";
import { headers } from "next/headers";
import { isValidSessionProof } from "@/lib/sessionProof";
import { readSessionProof } from "@/lib/sessionProofCookie";
import { maybeAlertFailedLogins } from "@/lib/loginAlerts";

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
 * skip the session-version check this pass", never a real stored value
 * (the column defaults to 1). Every other field here falls back to a
 * least-privilege default on a timeout, but doing the same for
 * sessionVersion would mean a slow database round trip randomly signs
 * people out, which is a worse failure mode than briefly trusting a stale
 * version the way the role/access fields already do.
 */
const SESSION_VERSION_UNKNOWN = -1;

// Fallback used only if loadEntitlements() itself doesn't come back in time
// (see loadEntitlementsBounded below), least-privilege defaults, since a
// degraded session should never accidentally grant more access than the DB
// actually confirms. Self-corrects on the next jwt callback run once the DB
// responds normally again. `onboarded: false` for the same reason, worst
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

// Single source of truth for "what can this user see", read by the jwt
// callback below so it can be baked into the session token. Unlock comes
// from two independent places: a verified legacy per-scale Zelle payment
// (Pay-As-You-Go, no longer purchasable but still honored for grandfathered
// rows), or a ScaleProgress row that already has unlockedAt set (covers
// curriculum-access grants and admin overrides, which stamp that field
// directly rather than creating a ZellePayment).
//
// Deliberately does NOT select `image`, that column can hold a multi-KB
// base64 data URI (the account settings avatar upload stores photos that
// way), and JWT session strategy puts everything here directly into a
// browser cookie. An oversized cookie gets silently dropped by the browser
// or rejected by an intermediate proxy, which look identical to "login
// hangs forever" from the client's perspective, this actually happened in
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
// on every subsequent session touch), a slow Postgres round trip here
// would otherwise block a login that already passed the real credential
// check, so it gets a hard cap rather than being trusted to always be fast.
// A few seconds of memory per server instance. Every page, every background poll (credits, sidebar) and every action reads the
// session, and each read used to cost about six database queries; a navigation now pays them once instead of several times
// over. A sign-in and an explicit session update always read fresh (`fresh`), so "I just changed my password" never
// signs the device that did it out. The ban check in getServerAuthSession is separate and stays live on every request.
const ENTITLEMENT_TTL_MS = 5_000;
const entitlementCache = new Map<string, { at: number; value: Entitlements }>();

async function loadEntitlementsBounded(userId: string, attempts = 2, fresh = false): Promise<Entitlements | null> {
  const hit = entitlementCache.get(userId);
  if (!fresh && hit && Date.now() - hit.at < ENTITLEMENT_TTL_MS) return hit.value;
  // A slow first query (a cold Neon database) is retried once before giving up.
  // Returning null means "unknown": the caller keeps what the token already
  // says instead of overwriting it with least-privilege defaults, which is
  // what used to send finished accounts back to the onboarding wizard.
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await Promise.race([
        loadEntitlements(userId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (result) {
        if (entitlementCache.size > 500) entitlementCache.clear();
        entitlementCache.set(userId, { at: Date.now(), value: result });
        return result;
      }
    } catch (err) {
      console.error("loadEntitlements failed:", err);
    }
  }
  return null;
}

export const authOptions: NextAuthOptions = {
  // Kept even though Credentials forces JWT sessions, it still owns the
  // Account/Session/VerificationToken tables for any OAuth provider added
  // later (e.g. Google sign-in) alongside email/password.
  adapter: PrismaAdapter(prisma),
  // maxAge (not just the strategy) is deliberate: edge middleware decodes
  // the JWT with next-auth/jwt's getToken(), which never runs the jwt
  // callback below, so a token that was force-signed-out (sessionVersion
  // bumped) or otherwise invalidated keeps being trusted at the edge for as
  // long as the cookie itself is valid, regardless of what the callback
  // would say. NextAuth's own default is 30 days; 7 bounds how long that
  // mismatch window can last for an action like "sign this person out" that
  // should feel close to immediate. updateAge (default 24h) still silently
  // rolls this forward on every active day, so a real, still-signed-in user
  // never notices, only an idle or force-signed-out session ever hits the
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
    // which, on success, silently issues a code server-side (never
    // emailed) and hands it straight back to the client, which immediately
    // calls signIn with it. Splitting it this way means this is the *only*
    // path that ever establishes a session, so this can't be bypassed by
    // calling signIn() directly with just a password. The code itself is
    // invisible to the user (see loginStepOneAction), this indirection
    // exists purely to keep a single credential-checking entry point, not to
    // actually require a second factor at login anymore.
    CredentialsProvider({
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
        secondStep: { label: "Second step", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.code) return null;

        // Guess limit for the code itself. Codes used to be issued only after a
        // correct password and never left the server, so this could not be
        // reached without one. "Email me a code" now emails a code to anyone who
        // asks for it, so signing in with a code must lock out like a password
        // does: the same failed-attempt log and limits as loginStepOneAction
        // (8 in 15 minutes per email), plus verifyCode's own 5 guesses per code.
        const normalizedEmail = credentials.email.trim().toLowerCase();

        // This try is written down BEFORE the window is counted (counting first
        // lets a burst of parallel requests all read a low count and all pass),
        // and removed again if the code turns out to be right so legitimate
        // sign-ins do not pile up toward the limit.
        const attempt = await prisma.failedLoginAttempt.create({ data: { email: normalizedEmail } });
        const recentTries = await prisma.failedLoginAttempt.count({
          where: { email: normalizedEmail, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
        });
        if (recentTries > 8) return null;
        await maybeAlertFailedLogins();

        // Admin two-step sign-in. Every route to a session ends here (password, reset, verify), so this is the one
        // place that cannot be skipped. Checked before the sign-in code is used up, so a missing second step does not
        // burn a code. The try recorded above stays counted when it fails, so wrong codes feed the same lockout.
        const candidate = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, role: true, totpEnabledAt: true } });
        if (candidate?.role === "ADMIN" && candidate.totpEnabledAt) {
          if (!credentials.secondStep || !(await consumeSecondStep(candidate.id, credentials.secondStep))) return null;
        }

        const result = await verifyCode(normalizedEmail, "LOGIN_2FA", credentials.code);
        if (!result.ok || !result.userId) return null;
        await prisma.failedLoginAttempt.delete({ where: { id: attempt.id } }).catch(() => undefined);

        const user = await prisma.user.findUnique({ where: { id: result.userId } });
        if (!user) return null;
        // The code was checked against the address typed, so it signs in only the account still at that address: one that moved to
        // another address since (an unconfirmed sign-up fixing a typo) must not be signed in by a code that went to the old one.
        if (user.email.toLowerCase() !== normalizedEmail) return null;
        // A banned account can never get a session, whichever way it asks for one (password, emailed code, reset, verify).
        if (user.bannedAt) throw new Error(BANNED_ERROR_CODE);
        // An account locked for non-payment cannot get a session either; the sign-in screens open /account-locked.
        if (user.paymentLockedAt) throw new Error(PAYMENT_LOCKED_CODE);

        // A sign-in from a browser or device this account has not used before is emailed to its owner.
        await recordSignInDevice(user, req?.headers?.["user-agent"], placeFromHeaders(req?.headers));

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          hasCurriculumAccess: user.hasCurriculumAccess,
          onboarded: Boolean(user.onboardedAt),
        };
      },
    }),
  ],
  callbacks: {
    // Runs on sign-in and on every subsequent session touch (useSession()
    // polling, getServerSession(), or an explicit client update() call after
    // a payment gets verified / a quiz gets passed). Edge middleware only
    // ever decodes the resulting cookie, it can't hit Postgres itself, so
    // this callback is the only place entitlements get re-derived from the
    // DB, and how often it runs is the whole staleness budget for gating.
    async jwt({ token, user, trigger }) {
      if (!token.sub) return token;

      const loaded = await loadEntitlementsBounded(token.sub, 2, Boolean(user) || trigger === "update");
      if (!loaded) {
        // Database did not answer: keep the last known values (or, on a fresh
        // sign-in, what authorize just read), they are corrected on the next
        // touch that does get an answer.
        const kept = tokenWhenEntitlementsUnknown(token, user);
        if (kept) return kept;
      }
      const entitlements = loaded ?? DEFAULT_ENTITLEMENTS;

      // Real "sign out other devices" enforcement, not just the UI copy
      // claiming it: every already-open session's token carries whatever
      // version was current at ITS OWN sign-in. A password change or the
      // explicit "sign out of all other devices" action bumps the column,
      // so the next time any of those other tokens touch this callback,
      // the comparison below fails and returning `{}` drops it (no `sub`,
      // so getServerAuthSession/useSession see it as logged out).
      if (entitlements.sessionVersion !== SESSION_VERSION_UNKNOWN) {
        if (user) {
          // Fresh sign-in: bake in the current version.
          token.sessionVersion = entitlements.sessionVersion;
        } else if (trigger === "update") {
          // The device that just bumped the version calls update() to re-stamp ITSELF. next-auth lets anyone holding a
          // signed cookie call update(), so a stale token is re-stamped only when this browser also carries the short-lived
          // proof the bumping action left behind (see sessionProof.ts); a copied old cookie has no proof and is dropped.
          if (typeof token.sessionVersion === "number" && token.sessionVersion !== entitlements.sessionVersion) {
            if (!isValidSessionProof(await readSessionProof(), token.sub, entitlements.sessionVersion)) return {} as JWT;
          }
          token.sessionVersion = entitlements.sessionVersion;
        } else if (typeof token.sessionVersion !== "number") {
          // A token issued before this field existed. Adopt the current
          // version rather than treating "never had one" as a mismatch,
          // otherwise shipping this signs out every already-open session
          // app-wide the moment it deploys.
          token.sessionVersion = entitlements.sessionVersion;
        } else if (token.sessionVersion !== entitlements.sessionVersion) {
          // Deliberately not a real JWT, the cast is the intentional part.
          // getServerAuthSession/useSession/middleware all key off `sub`
          // being present, not off matching this type's shape, so an empty
          // object correctly reads as "no session" everywhere it's checked.
          return {} as JWT;
        }
      }

      if (trigger === "update") {
        // An email change keeps the session; this device picks the new address up here.
        const current = await prisma.user.findUnique({ where: { id: token.sub }, select: { email: true } });
        if (current) token.email = current.email;
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
 * wraps, which each need the session independently, share one lookup per
 * request instead of re-decoding the JWT repeatedly.
 *
 * Also the one place that guards against a stale session: a browser can
 * hold a valid, signed JWT for a user row that no longer exists (deleted
 * directly in the DB, a wiped test account, etc). loadEntitlements() can't
 * tell that apart from "brand new user with no entitlements yet," so it
 * silently returns defaults, every other caller in the app trusts
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

  // Asked together, not one after the other: this runs on every page.
  const ua = (await headers()).get("user-agent");
  const [exists, deviceOut] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, bannedAt: true, paymentLockedAt: true } }),
    isDeviceSignedOut(session.user.id, ua),
  ]);
  // A ban or a non-payment lock takes effect on the very next request, not only when the old session's token is refreshed.
  // One device signed out from the list: only a browser matching it is refused, every other session carries on.
  return exists && !exists.bannedAt && !exists.paymentLockedAt && !deviceOut ? session : null;
});
