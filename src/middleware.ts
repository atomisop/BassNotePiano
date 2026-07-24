import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { scaleIndexFromSlug } from "@/lib/curriculum";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/login",
  "/register",
  "/reset-password",
];

function isPublic(pathname: string) {
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/_next")) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Edge middleware can't hit Postgres directly, so gating decisions are made
// entirely from entitlement claims baked into the NextAuth JWT (see
// src/types/next-auth.d.ts). Those claims are refreshed server-side whenever
// a ZellePayment is verified or a ScaleProgress row completes — this
// middleware never needs to know *why* a slug is unlocked, only that it is.
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Mandatory one-time profile wizard — every other protected route bounces
  // here until it's done. Checked before role/entitlement gating below so an
  // unonboarded admin still lands on the wizard rather than /admin.
  if (!token.onboarded && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (pathname.startsWith("/admin")) {
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  const scaleMatch = pathname.match(/^\/scales\/([^/]+)/);
  if (!scaleMatch) return NextResponse.next();

  const slug = scaleMatch[1];
  const targetIndex = scaleIndexFromSlug(slug);
  if (targetIndex === -1) return NextResponse.next(); // unknown slug — let the page 404

  const hasCurriculumAccess = Boolean(token.hasCurriculumAccess);
  const unlocked = token.unlockedScaleSlugs ?? [];
  const completed = token.completedScaleSlugs ?? [];

  const highestCompletedIndex = completed.reduce(
    (max, s) => Math.max(max, scaleIndexFromSlug(s)),
    -1,
  );
  const nextAllowedIndex = highestCompletedIndex + 1;

  const isAlreadyUnlocked = unlocked.includes(slug) || completed.includes(slug);
  const isOutOfOrder = targetIndex > nextAllowedIndex;

  // Already unlocked (legacy per-scale grant, or completed) — always
  // allowed, no interception needed.
  if (isAlreadyUnlocked) {
    return NextResponse.next();
  }

  if (hasCurriculumAccess) {
    // Curriculum access bypasses sequencing entirely, but jumping ahead out
    // of order gets routed through a confirmation interstitial (the
    // ProOverrideConfirmModal lives on that page — middleware can only
    // redirect, it can't render a Framer Motion modal itself).
    if (isOutOfOrder) {
      const alreadyConfirmed = req.cookies.get(`override_${slug}`)?.value === "1";
      const justConfirmed = searchParams.get("override") === "confirmed";

      if (alreadyConfirmed || justConfirmed) {
        const res = NextResponse.next();
        if (justConfirmed) {
          res.cookies.set(`override_${slug}`, "1", {
            maxAge: 60 * 60 * 24, // 24h — re-confirm daily rather than nag every click
            httpOnly: true,
            sameSite: "lax",
          });
        }
        return res;
      }

      const interceptUrl = new URL(`/scales/${slug}/override`, req.url);
      interceptUrl.searchParams.set("next", pathname + req.nextUrl.search);
      interceptUrl.searchParams.set("targetLevel", String(targetIndex + 1));
      return NextResponse.redirect(interceptUrl);
    }
    return NextResponse.next();
  }

  // No curriculum access and this scale was never individually unlocked
  // (legacy grandfathered purchase) — the only way forward now is buying
  // the full curriculum, regardless of where this scale sits in sequence
  // (per-scale purchase no longer exists).
  const billingUrl = new URL("/billing/curriculum", req.url);
  billingUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(billingUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/scales/:path*",
    "/admin/:path*",
    "/billing/:path*",
    "/account/:path*",
    "/friends/:path*",
    "/messages/:path*",
    "/onboarding",
  ],
};
