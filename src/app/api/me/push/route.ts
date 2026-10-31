import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePushSubscription } from "@/lib/pushRules";
import { pushPublicKey } from "@/lib/webPush";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store" };

async function who() {
  const session = await getServerAuthSession();
  return session?.user?.id ?? null;
}

/** Whether push is set up on the server, and how many of this person's browsers are subscribed. */
export async function GET(req: Request) {
  const id = await who();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: H });
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const [count, here] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId: id } }),
    endpoint ? prisma.pushSubscription.count({ where: { userId: id, endpoint } }) : Promise.resolve(0),
  ]);
  return NextResponse.json({ publicKey: pushPublicKey(), count, subscribedHere: here > 0 }, { headers: H });
}

export async function POST(req: Request) {
  const id = await who();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: H });
  if (!pushPublicKey()) return NextResponse.json({ error: "Push is not set up yet." }, { status: 503, headers: H });
  const sub = parsePushSubscription(await req.json().catch(() => null));
  if (!sub) return NextResponse.json({ error: "That does not look like a push subscription." }, { status: 400, headers: H });
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 200) || null;
  // A browser keeps one endpoint; if another account used it before on this browser, it now belongs to the person signed in.
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: id, ...sub, userAgent },
    update: { userId: id, p256dh: sub.p256dh, auth: sub.auth, userAgent },
  });
  return NextResponse.json({ ok: true }, { headers: H });
}

export async function DELETE(req: Request) {
  const id = await who();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: H });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint." }, { status: 400, headers: H });
  await prisma.pushSubscription.deleteMany({ where: { userId: id, endpoint: body.endpoint } });
  return NextResponse.json({ ok: true }, { headers: H });
}
