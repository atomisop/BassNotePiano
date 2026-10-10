import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

/**
 * Tells one student to connect Discord: an email with the three steps and links (unless they turned account update emails off),
 * plus an in-app notice. Like "Resend bill" on a payment plan, it is something the owner presses on purpose.
 */
export async function notifyToConnectDiscord(userId: string): Promise<"sent" | "opted-out" | "already-connected" | "banned"> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, discordId: true, bannedAt: true, notifyEmailRoleUpdates: true } });
  if (user.bannedAt) return "banned";
  if (user.discordId) return "already-connected";

  await createNotification({
    userId,
    type: "CLASS_REMINDER",
    title: "Connect your Discord",
    body: "Your class calls happen on Discord. 1. Download the free Discord app on your phone. 2. Create a Discord account at discord.com/register. 3. Open Lessons and tap Connect Discord.",
    cta: { label: "Connect Discord", path: "/lessons" },
  });
  // Account updates are on by default (reminders are off by default, so they would never reach most students).
  if (!user.notifyEmailRoleUpdates) return "opted-out";
  const { sendDiscordConnectEmail } = await import("@/lib/email");
  await sendDiscordConnectEmail(user.email);
  return "sent";
}
