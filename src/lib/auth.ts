import { cache } from "react";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type Entitlements = {
  role: "STUDENT" | "ADMIN";
  isProMember: boolean;
  unlockedScaleSlugs: string[];
  completedScaleSlugs: string[];
};

// Single source of truth for "what can this user see" — read by the jwt
// callback below so it can be baked into the session token. Unlock comes
// from two independent places: a verified $25 Zelle payment for that scale,
// or a ScaleProgress row that already has unlockedAt set (covers Pro grants
// and admin overrides, which stamp that field directly rather than creating
// a ZellePayment).
async function loadEntitlements(userId: string): Promise<Entitlements> {
  const [user, verifiedUnlocks, unlockedProgress] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isProMember: true },
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
    isProMember: user?.isProMember ?? false,
    unlockedScaleSlugs,
    completedScaleSlugs,
  };
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
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isProMember: user.isProMember,
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

      const entitlements = await loadEntitlements(token.sub);
      token.role = entitlements.role;
      token.isProMember = entitlements.isProMember;
      token.unlockedScaleSlugs = entitlements.unlockedScaleSlugs;
      token.completedScaleSlugs = entitlements.completedScaleSlugs;

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.isProMember = token.isProMember;
        session.user.unlockedScaleSlugs = token.unlockedScaleSlugs;
        session.user.completedScaleSlugs = token.completedScaleSlugs;
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
