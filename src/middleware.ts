import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Edge middleware can't hit Postgres directly, so it only handles what the
// NextAuth JWT can answer on its own: signed in, onboarded, admin or not.
// Curriculum access is checked against the database where the content is
// served (see the note at the bottom of this function).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  // Scale access (plan, trial, teacher approval) is decided per request
  // against the database in the scale page and its server actions, not here:
  // it depends on time-based state a cached token can't keep fresh, and a
  // stale claim would wrongly bounce a paying student.
  return NextResponse.next();
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
    "/lessons/:path*",
    "/practice/:path*",
    "/profile/:path*",
    "/mail/:path*",
    "/about",
    "/onboarding",
  ],
};
