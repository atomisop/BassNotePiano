import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const TRUSTED_DEVICE_COOKIE = "bnp_trusted_device";
export const TRUSTED_DEVICE_DAYS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** True if `rawToken` (read from the cookie) is a valid, unexpired trusted device for `userId`. */
export async function isTrustedDevice(userId: string, rawToken: string | undefined): Promise<boolean> {
  if (!rawToken) return false;

  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!device || device.userId !== userId) return false;
  if (device.expiresAt < new Date()) return false;

  return true;
}

/** Creates a new trusted-device record for "remember me" and returns the raw token to store in a cookie. */
export async function createTrustedDevice(userId: string, label?: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      label,
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return rawToken;
}
