import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { notifyAdmins } from "@/lib/adminNotifications";
import { startTrialForEmail } from "@/lib/entitlement";
import { getBoolSetting } from "@/lib/siteSettings";
import { isDisposableEmailDomain } from "@/lib/disposableEmail";
import { cleanPersonName } from "@/lib/studentName";
import { hasParentControl } from "@/lib/parentLinks";
import { reportError } from "@/lib/reportError";
import type { GoogleRefusal } from "@/lib/googleSignInMessages";

/**
 * Sign in with Google (added 2026-11-12). Google only proves who owns an inbox, so this is deliberately narrow:
 *  - the email must be one Google itself has verified;
 *  - an existing account is found by its Google id first (it survives an email change), then by its email, and Google never signs in an
 *    admin (admins keep password plus authenticator code), a child account (its parent manages it), a banned or payment-locked account;
 *  - a password-account nobody ever confirmed is confirmed by Google AND has its password removed, so whoever registered it first
 *    with a password they know cannot keep a way in to someone else's inbox;
 *  - a new person gets a normal student account (free trial, owner alert) with no password: they add one later with "Forgot password".
 * The result is turned into a session by the NextAuth `signIn` callback in auth.ts.
 */

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string | null };

export type GoogleOutcome =
  | { ok: true; isNew: boolean; user: { id: string; email: string; name: string | null; role: "STUDENT" | "ADMIN"; hasCurriculumAccess: boolean; onboarded: boolean } }
  | { ok: false; reason: GoogleRefusal };

const userSelect = { id: true, email: true, name: true, role: true, hasCurriculumAccess: true, onboardedAt: true, bannedAt: true, paymentLockedAt: true, emailVerified: true, passwordHash: true } as const;

export async function resolveGoogleUser(profile: GoogleProfile): Promise<GoogleOutcome> {
  try {
    const email = profile.email.trim().toLowerCase();
    if (!profile.emailVerified || !email.includes("@")) return { ok: false, reason: "unverified" };

    // The Google id first: it is the stable identity, the email can change on either side.
    const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } }, select: { user: { select: userSelect } } });
    const byEmail = linked?.user ?? (await prisma.user.findFirst({ where: { OR: [{ email }, { emailCanonical: canonicalEmail(email) }] }, select: userSelect }));

    if (byEmail) {
      const u = byEmail;
      if (u.bannedAt) return { ok: false, reason: "banned" };
      if (u.paymentLockedAt) return { ok: false, reason: "locked" };
      if (u.role === "ADMIN") return { ok: false, reason: "admin" };
      if (await hasParentControl(u.id)) return { ok: false, reason: "child" };

      // Only an inbox Google vouches for can be matched to an account by email (a Google id link already proved it).
      if (!linked && u.email.toLowerCase() !== email && canonicalEmail(u.email) !== canonicalEmail(email)) return { ok: false, reason: "failed" };

      if (!u.emailVerified) {
        // Never confirmed by anyone: Google confirms it now, and the password it was registered with (known to whoever typed it first) is removed.
        await prisma.user.update({ where: { id: u.id }, data: { emailVerified: new Date(), passwordHash: null, sessionVersion: { increment: 1 } } });
      }
      if (!linked) {
        await prisma.account.create({ data: { userId: u.id, type: "oauth", provider: "google", providerAccountId: profile.sub } }).catch(() => undefined);
      }
      return { ok: true, isNew: false, user: { id: u.id, email: u.email, name: u.name, role: u.role, hasCurriculumAccess: u.hasCurriculumAccess, onboarded: Boolean(u.onboardedAt) } };
    }

    // A new person.
    if (!(await getBoolSetting("signup.open"))) return { ok: false, reason: "closed" };
    if ((await getBoolSetting("signup.blockDisposable")) && isDisposableEmailDomain(email)) return { ok: false, reason: "disposable" };

    const name = profile.name ? cleanPersonName(profile.name) : "";
    const created = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        emailCanonical: canonicalEmail(email),
        emailVerified: new Date(),
        accounts: { create: { type: "oauth", provider: "google", providerAccountId: profile.sub } },
      },
      select: { id: true, email: true, name: true, role: true, hasCurriculumAccess: true, onboardedAt: true },
    });
    await startTrialForEmail(created.email).catch((err) => reportError(err, "Starting the free trial failed (Google sign-up)"));
    await notifyAdmins("NEW_ACCOUNT", {
      type: "ADMIN_ALERT",
      title: "New account, signed up with Google",
      body: `${created.name ?? created.email} (${created.email}) just created an account with Google. Their email is already verified.`,
      emailCategory: "social",
      cta: { label: "View account", path: `/admin/users/${created.id}` },
    }).catch((err) => reportError(err, "New account alert failed (Google sign-up)"));
    return { ok: true, isNew: true, user: { id: created.id, email: created.email, name: created.name, role: created.role, hasCurriculumAccess: created.hasCurriculumAccess, onboarded: false } };
  } catch (err) {
    reportError(err, "Google sign-in failed");
    return { ok: false, reason: "failed" };
  }
}
