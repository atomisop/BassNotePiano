import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildStrictCsp, isProtectedPath, newNonce } from "@/lib/csp";
import { isWrongRecipient, RECIPIENT_HINT_PARAM, RECIPIENT_PARAM } from "@/lib/recipientTag";
import { onboardingRedirect } from "@/lib/inPlaceLinks";

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

  if (!isProtectedPath(pathname)) {
    // A link from an email is made for one person (see recipientTag.ts). Even on a page that needs no sign-in (such as
    // /unsubscribe), someone signed in as a DIFFERENT account must not be waved through as if the link were theirs: stop and
    // say so. Nobody signed in, or the right account, goes straight on.
    if (req.nextUrl.searchParams.has(RECIPIENT_PARAM) && pathname !== "/wrong-account") {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (token?.sub && (await isWrongRecipient(req.nextUrl.searchParams, token.email))) {
        const stop = new URL("/wrong-account", req.url);
        stop.searchParams.set("next", pathname + req.nextUrl.search);
        const hint = req.nextUrl.searchParams.get(RECIPIENT_HINT_PARAM);
        if (hint) stop.searchParams.set("for", hint.slice(0, 80));
        return NextResponse.redirect(stop);
      }
    }
    return next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // A session that was ended on the server (a demotion, a password change, "sign out other devices") leaves a cookie that
  // still decodes, but to an empty token with no user id. That is signed out, not an unfinished profile.
  if (!token?.sub) {
    const loginUrl = new URL("/login", req.url);
    // Keep the query string: an emailed link carries a "who is this for" tag that must survive the sign-in.
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // An emailed link tagged for a different account than the one signed in: stop and say so, instead of showing this
  // account's own bill, plan or messages as if they were the ones the email was about.
  if (await isWrongRecipient(req.nextUrl.searchParams, token.email)) {
    const stop = new URL("/wrong-account", req.url);
    stop.searchParams.set("next", pathname + req.nextUrl.search);
    const hint = req.nextUrl.searchParams.get(RECIPIENT_HINT_PARAM);
    if (hint) stop.searchParams.set("for", hint.slice(0, 80));
    return NextResponse.redirect(stop);
  }

  // Mandatory one-time profile wizard, every other protected route bounces
  // here until it's done. Checked before role/entitlement gating below so an
  // unonboarded admin still lands on the wizard rather than /admin.
  if (!token.onboarded && pathname !== "/onboarding") {
    // Keep where they were going (a plan picked on /pricing, say) as ?next=, so the wizard ends there instead of on Home.
    return NextResponse.redirect(new URL(onboardingRedirect(pathname, req.nextUrl.search), req.url));
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
    "/(dashboard|scales|admin|billing|account|friends|messages|lessons|practice|profile|mail|parent)/:path*",
  ],
};
