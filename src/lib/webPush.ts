import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/** Push needs a VAPID key pair in the environment (generate with `npx web-push generate-vapid-keys`). Without it every call here does nothing. */
export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

let configured = false;
function configure(): boolean {
  if (!pushPublicKey()) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:music@bassnotepiano.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

export interface PushMessage {
  title: string;
  body: string;
  /** A path inside the app that opens when the notification is tapped. */
  url?: string;
}

/** Sends to every browser the person subscribed. A subscription the push service reports gone is deleted. Never throws. Returns how many were delivered. */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<number> {
  try {
    if (!configure()) return 0;
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return 0;
    const payload = JSON.stringify({ title: message.title.slice(0, 120), body: message.body.slice(0, 300), url: message.url?.startsWith("/") ? message.url : "/dashboard" });
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          delivered += 1;
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
          else console.error("Push send failed (non-blocking):", code ?? err);
        }
      }),
    );
    return delivered;
  } catch (err) {
    console.error("Push failed (non-blocking):", err);
    return 0;
  }
}
