import { NextResponse } from "next/server";
import { reportError } from "@/lib/reportError";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { clientAddress } from "@/lib/assistantInput";
import { parseCspViolation, summarizeCspReport } from "@/lib/csp";

// Where browsers send Content-Security-Policy-Report-Only violations. It only writes one log line per report (Netlify
// function logs: search for "CSP violation"), is size limited and rate limited, and always answers 204, so it tells a
// caller nothing and cannot be used to fill the database or the logs.
const MAX_BYTES = 10_000;

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BYTES) return new NextResponse(null, { status: 204 });
  try {
    await consumeRateLimit(prisma, `csp-report:all`, { windowMinutes: 1, max: 120, message: "limit" });
    await consumeRateLimit(prisma, `csp-report:${clientAddress(await headers())}`, { windowMinutes: 1, max: 20, message: "limit" });
  } catch (err) {
    if (err instanceof RateLimitError) return new NextResponse(null, { status: 204 });
    throw err;
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const line = summarizeCspReport(body);
  if (line) console.warn(`CSP violation: ${line}`);
  // Also counted, by what was blocked and where, so Admin > Security can show whether anything real would break if the policy were enforced.
  const key = parseCspViolation(body);
  if (key) {
    try {
      // A ceiling on distinct rows so a flood of made-up reports cannot grow the table. When it is full, the row not seen for the longest makes
      // room, so real violations that keep happening stay and a flood can never freeze the table (and hide what the policy would block).
      const known = await prisma.cspViolation.findUnique({ where: { directive_blocked_page: key }, select: { id: true } });
      if (!known && (await prisma.cspViolation.count()) >= 500) {
        const oldest = await prisma.cspViolation.findFirst({ orderBy: { lastSeenAt: "asc" }, select: { id: true } });
        if (oldest) await prisma.cspViolation.delete({ where: { id: oldest.id } }).catch(() => undefined);
      }
      await prisma.cspViolation.upsert({
        where: { directive_blocked_page: key },
        update: { count: { increment: 1 }, lastSeenAt: new Date() },
        create: { ...key, count: 1 },
      });
    } catch (err) {
      reportError(err, "CSP violation could not be counted");
    }
  }
  return new NextResponse(null, { status: 204 });
}
