import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// STEP 24 — AVAILABILITY/RECOVERY. The one thing an uptime monitor (or a
// human, mid-incident) should be able to hit to answer "is the app actually
// working, not just responding" — a route that resolves without touching
// the database proves Next.js/Netlify are up, but says nothing about
// whether Neon is reachable, which is the dependency most incidents this
// app is realistically exposed to actually involve. `SELECT 1` is the
// standard cheapest-possible real query: it exercises the connection and
// auth without touching an actual table, and Prisma's own connection pool.
export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok", checkedAt });
  } catch (err) {
    // No error detail in the response body — this endpoint is meant to be
    // hit by external monitors and isn't authenticated, so it's public by
    // design (same reasoning as Step 4's "no production stack traces"
    // rule). The real error still goes to the server log / Sentry (Step
    // 21's instrumentation already captures unhandled route errors), an
    // operator investigating has that, an anonymous prober doesn't need it.
    console.error("Health check: database unreachable", err);
    return NextResponse.json({ status: "error", database: "unreachable", checkedAt }, { status: 503 });
  }
}
