import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendNewDeviceEmail } from "@/lib/email";

/**
 * Emails the owner of an account when it is signed in to from a browser or device it has not been signed in from before.
 * A device is the browser plus the operating system read from the User-Agent (never the IP address, which changes all the
 * time and would make every coffee shop a "new device"). Only ever runs after a successful sign-in, so it cannot be used
 * to find out whether an account exists. The first device an account ever uses is just recorded, with no email.
 */

export function describeDevice(userAgent: string | null | undefined): { label: string; key: string } {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "an unknown browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return { label: `${browser} on ${os}`, key: `${browser}|${os}` };
}

export async function recordSignInDevice(user: { id: string; email: string; name: string | null }, userAgent: string | null | undefined): Promise<void> {
  try {
    const { label, key } = describeDevice(userAgent);
    const deviceHash = createHash("sha256").update(`${user.id}|${key}`).digest("hex");
    const known = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash } } });
    if (known) {
      await prisma.knownDevice.update({ where: { id: known.id }, data: { lastSeenAt: new Date() } });
      return;
    }
    const others = await prisma.knownDevice.count({ where: { userId: user.id } });
    try {
      await prisma.knownDevice.create({ data: { userId: user.id, deviceHash, label } });
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
