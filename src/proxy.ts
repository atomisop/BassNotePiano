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
// proxy never needs to know *why* a slug is unlocked, only that it is.
//
// Renamed from middleware.ts/middleware() to proxy.ts/proxy() as part of the
// Next 14->16 upgrade — Next.js 16 deprecated the "middleware" file
// convention/export name in favor of "proxy" (same request-interception
// mechanism, same file location convention, just a rename). Everything
// below is unchanged logic.
export async function proxy(req: NextRequest) {
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

      // No dedicated confirmation page exists — ProOverrideConfirmModal
      // lives on the roadmap itself (src/components/progression/
      // ScaleRoadmap.tsx), which re-navigates here with ?override=confirmed
      // once the student confirms. A direct/bookmarked/back-button visit
      // that skips that flow gets bounced to the roadmap to confirm there,
      // rather than redirected to a page that doesn't exist (which used to
      // loop: this same out-of-order check would re-fire on that URL too).
      return NextResponse.redirect(new URL("/dashboard", req.url));
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
