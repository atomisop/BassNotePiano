import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { clientAddress } from "@/lib/assistantInput";

// A plain count of page views per day for the public pages. No cookies, no IP,
// no user id: just "/pricing was viewed once more today".
const ALLOWED = new Set(["/", "/classes", "/pricing", "/shop", "/register", "/login", "/terms", "/privacy"]);

// Open to everyone on purpose (a visitor has no account), so it is size limited and rate limited per address: one browser cannot
// inflate the counts, and it always answers 204 so it tells a caller nothing.
const MAX_BYTES = 1_000;

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BYTES) return new NextResponse(null, { status: 204 });
  try {
    await consumeRateLimit(prisma, `page-hit:${clientAddress(await headers())}`, { windowMinutes: 1, max: 30, message: "limit" });
  } catch (err) {
    if (err instanceof RateLimitError) return new NextResponse(null, { status: 204 });
    throw err;
  }
  const body = (() => {
    try {
      return JSON.parse(text) as { path?: unknown };
    } catch {
      return null;
    }
  })();
  const path = typeof body?.path === "string" ? body.path : "";
  if (!ALLOWED.has(path)) return new NextResponse(null, { status: 204 });

  const today = new Date();
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await prisma.pageHit
    .upsert({ where: { day_path: { day, path } }, update: { count: { increment: 1 } }, create: { day, path, count: 1 } })
    .catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
