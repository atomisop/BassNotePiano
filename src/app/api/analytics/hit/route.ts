import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// A plain count of page views per day for the public pages. No cookies, no IP,
// no user id: just "/pricing was viewed once more today".
const ALLOWED = new Set(["/", "/classes", "/pricing", "/shop", "/register", "/login", "/terms", "/privacy"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  if (!ALLOWED.has(path)) return new NextResponse(null, { status: 204 });

  const today = new Date();
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await prisma.pageHit
    .upsert({ where: { day_path: { day, path } }, update: { count: { increment: 1 } }, create: { day, path, count: 1 } })
    .catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
