import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { clientAddress } from "@/lib/assistantInput";
import { summarizeCspReport } from "@/lib/csp";

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
  return new NextResponse(null, { status: 204 });
}
