import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildStrictCsp, isProtectedPath, newNonce } from "@/lib/csp";

// Edge middleware can't hit Postgres directly, so it only handles what the
// NextAuth JWT can answer on its own: signed in, onboarded, admin or not.
// Curriculum access is checked against the database where the content is
// served (see the note at the bottom of this function).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Every page gets a fresh nonce and the stricter policy as REPORT-ONLY (nothing is blocked by it yet; the
  // enforced policy is in next.config.mjs). Next.js reads the nonce from the request header and puts it on its own scripts.
  const nonce = newNonce();
  const reportOnly = buildStrictCsp(nonce, process.env.NODE_ENV !== "production", {
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  });
  const forward = new Headers(req.headers);
  forward.set("x-nonce", nonce);
  forward.set("content-security-policy-report-only", reportOnly);
  const next = () => {
    const res = NextResponse.next({ request: { headers: forward } });
    res.headers.set("Content-Security-Policy-Report-Only", reportOnly);
    return res;
  };

  if (!isProtectedPath(pathname)) return next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Mandatory one-time profile wizard, every other protected route bounces
  // here until it's done. Checked before role/entitlement gating below so an
  // unonboarded admin still lands on the wizard rather than /admin.
  if (!token.onboarded && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (pathname.startsWith("/admin")) {
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return next();
  }

  // Scale access (plan, trial, teacher approval) is decided per request
  // against the database in the scale page and its server actions, not here:
  // it depends on time-based state a cached token can't keep fresh, and a
  // stale claim would wrongly bounce a paying student.
  return next();
}

// Every page, so each one gets a nonce. Static files and API routes (no HTML) are skipped, but the signed-in areas are
// matched again by prefix so a path ending in a file extension (such as /admin/x.json) still goes through the sign-in check.
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|pdf|txt|xml|json|mp3|mp4)$).*)",
    "/(dashboard|scales|admin|billing|account|friends|messages|lessons|practice|profile|mail)/:path*",
  ],
};
