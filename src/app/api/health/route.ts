import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/reportError";

// STEP 24 — AVAILABILITY/RECOVERY. The one thing an uptime monitor (or a
// human, mid-incident) should be able to hit to answer "is the app actually
// working, not just responding" — a route that resolves without touching
// the database proves Next.js/Netlify are up, but says nothing about
// whether Neon is reachable, which is the dependency most incidents this
// app is realistically exposed to actually involve. `SELECT 1` is the
// standard cheapest-possible real query: it exercises the connection and
// auth without touching an actual table, and Prisma's own connection pool.
//
// force-dynamic: without it Next.js runs this route once at build time and
// serves that saved answer forever, so the check would say "ok" with a dead
// database. no-store keeps any cache in front of it from doing the same.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok", checkedAt }, { headers: NO_STORE });
  } catch (err) {
    // No error detail in the response body — this endpoint is meant to be
    // hit by external monitors and isn't authenticated, so it's public by
    // design (same reasoning as Step 4's "no production stack traces"
    // rule). The real error still goes to the server log and GlitchTip
    // (reportError), an operator investigating has that, an anonymous prober
    // doesn't need it.
    reportError(err, "Health check: database unreachable");
    return NextResponse.json({ status: "error", database: "unreachable", checkedAt }, { status: 503, headers: NO_STORE });
  }
}
