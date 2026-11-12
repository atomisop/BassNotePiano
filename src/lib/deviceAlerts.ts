import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendNewDeviceEmail } from "@/lib/email";

/**
 * Emails the owner of an account when it is signed in to from a browser or device it has not been signed in from before.
 * A device is the browser plus the operating system read from the User-Agent (never the IP address, which changes all the
 * time and would make every coffee shop a "new device"). Only ever runs after a successful sign-in, so it cannot be used
 * to find out whether an account exists. The first device an account ever uses is just recorded, with no email.
 */

export interface DevicePlace {
  city: string | null;
  region: string | null;
  country: string | null;
}

type HeaderBag = { get(name: string): string | null } | Record<string, string | string[] | undefined> | null | undefined;

function header(bag: HeaderBag, name: string): string | null {
  if (!bag) return null;
  if (typeof (bag as { get?: unknown }).get === "function") return (bag as { get(n: string): string | null }).get(name);
  const v = (bag as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const clean = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * A rough place (city, region, country) from the geolocation headers the hosting network adds to a request: Netlify
 * (x-nf-geo, base64 JSON), Vercel and Cloudflare. The IP address itself is never read or stored. Null parts mean the host did
 * not say, which is also what a local development server sends.
 */
export function placeFromHeaders(bag: HeaderBag): DevicePlace {
  const nf = header(bag, "x-nf-geo");
  if (nf) {
    for (const text of [nf, (() => { try { return Buffer.from(nf, "base64").toString("utf8"); } catch { return ""; } })()]) {
      try {
        const geo = JSON.parse(text) as { city?: string; country?: { code?: string; name?: string }; subdivision?: { code?: string; name?: string } };
        return { city: clean(geo.city), region: clean(geo.subdivision?.name ?? geo.subdivision?.code), country: clean(geo.country?.name ?? geo.country?.code) };
      } catch {
        // try the next reading
      }
    }
  }
  const decode = (v: string | null) => {
    if (!v) return null;
    try { return clean(decodeURIComponent(v)); } catch { return clean(v); }
  };
  return {
    city: decode(header(bag, "x-vercel-ip-city") ?? header(bag, "cf-ipcity")),
    region: decode(header(bag, "x-vercel-ip-country-region") ?? header(bag, "cf-region")),
    country: decode(header(bag, "x-vercel-ip-country") ?? header(bag, "cf-ipcountry")),
  };
}

export function placeLabel(p: DevicePlace): string | null {
  const parts = [p.city, p.region, p.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** "Phone", "Tablet" or "Computer", from the operating system part of a device label. */
export function deviceKind(label: string): "Phone" | "Tablet" | "Computer" {
  if (/ on (iPhone|Android)$/.test(label)) return "Phone";
  if (/ on iPad$/.test(label)) return "Tablet";
  return "Computer";
}

/** A device counts as active while it has checked in this recently (an open tab checks in about every minute). */
export const DEVICE_ACTIVE_MS = 5 * 60_000;

export function describeDevice(userAgent: string | null | undefined): { label: string; key: string } {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "an unknown browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return { label: `${browser} on ${os}`, key: `${browser}|${os}` };
}

export async function recordSignInDevice(user: { id: string; email: string; name: string | null }, userAgent: string | null | undefined, place: DevicePlace = { city: null, region: null, country: null }, sid?: string): Promise<void> {
  try {
    const { label, key } = describeDevice(userAgent);
    const deviceHash = createHash("sha256").update(`${user.id}|${key}`).digest("hex");
    const known = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash } } });
    if (known) {
      await prisma.knownDevice.update({ where: { id: known.id }, data: { lastSeenAt: new Date(), signedInAt: new Date(), signedOutAt: null, ...(sid ? { sessionIds: withSession(known.sessionIds, sid) } : {}), ...place } });
      return;
    }
    const others = await prisma.knownDevice.count({ where: { userId: user.id } });
    try {
      await prisma.knownDevice.create({ data: { userId: user.id, deviceHash, label, ...(sid ? { sessionIds: [sid] } : {}), ...place } });
    } catch {
      return; // two sign-ins at once from the same new device: the other one sends the email
    }
    if (others === 0) return; // the account's first device
    const when = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
    await sendNewDeviceEmail(user.email, user.name, label, `${when} Eastern`);
  } catch (err) {
    console.error("New device alert failed (non-blocking):", err);
  }
}

/** The newest 20 session ids of a device, with this one added (and moved to the end if it was already there). */
export function withSession(existing: string[], sid: string): string[] {
  return [...existing.filter((x) => x !== sid), sid].slice(-20);
}

export function hashFor(userId: string, userAgent: string | null | undefined): string {
  return createHash("sha256").update(`${userId}|${describeDevice(userAgent).key}`).digest("hex");
}

/** The id of the device record for this browser, or null if this browser has not been recorded. */
export async function currentDeviceId(userId: string, userAgent: string | null | undefined): Promise<string | null> {
  const row = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId, deviceHash: hashFor(userId, userAgent) } }, select: { id: true } });
  return row?.id ?? null;
}

/**
 * Called by the background status check an open tab makes about every minute, so "active" means "has a tab open right now".
 * Quiet and cheap: it writes at most once every 2 minutes per device, and records a device the first time a session that
 * predates this feature is seen (without emailing anyone).
 */
export async function touchDevice(userId: string, userAgent: string | null | undefined, place: DevicePlace, sid?: string): Promise<void> {
  try {
    const deviceHash = hashFor(userId, userAgent);
    const now = new Date();
    const hasPlace = Boolean(place.city || place.region || place.country);
    const exists = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId, deviceHash } }, select: { id: true, sessionIds: true, lastSeenAt: true } });
    // A session id seen on this device for the first time is remembered, so signing the device out revokes it (even a copied cookie
    // replayed under another browser label ends up on that label's row and is revoked by id all the same).
    const newSession = Boolean(sid && exists && !exists.sessionIds.includes(sid));
    if (exists && !newSession && now.getTime() - exists.lastSeenAt.getTime() < 2 * 60_000) return;
    if (exists) {
      await prisma.knownDevice.update({ where: { id: exists.id }, data: { lastSeenAt: now, ...(hasPlace ? place : {}), ...(sid ? { sessionIds: withSession(exists.sessionIds, sid) } : {}) } });
      return;
    }
    await prisma.knownDevice.create({ data: { userId, deviceHash, label: describeDevice(userAgent).label, ...(sid ? { sessionIds: [sid] } : {}), ...place } }).catch(() => undefined);
  } catch (err) {
    console.error("Device check-in failed (non-blocking):", err);
  }
}

/** True when the person signed this browser out from the devices list; the session on it is then treated as signed out. */
export async function isDeviceSignedOut(userId: string, userAgent: string | null | undefined): Promise<boolean> {
  const row = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId, deviceHash: hashFor(userId, userAgent) } }, select: { signedOutAt: true } });
  return Boolean(row?.signedOutAt);
}
