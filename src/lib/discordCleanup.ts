import { prisma } from "@/lib/prisma";
import { deleteChannel, removeFromGuild } from "@/lib/discordApi";

/**
 * When an account is deleted, its Discord leftovers go with it: the person is removed from the server, and any private class call
 * made for them that nobody else is in is deleted. Deleting the account removes their bookings, so without this the class
 * job would never learn about those calls and they would stay in Discord forever. Best effort: it never blocks the deletion.
 */
export async function removeDiscordPresence(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true } });
    const mine = await prisma.classBooking.findMany({ where: { studentId: userId, discordChannelId: { not: null } }, select: { discordChannelId: true } });
    for (const channelId of Array.from(new Set(mine.map((b) => b.discordChannelId as string)))) {
      const sharedWithOthers = await prisma.classBooking.count({ where: { discordChannelId: channelId, studentId: { not: userId } } });
      if (sharedWithOthers === 0) await deleteChannel(channelId).catch((err) => console.error("Discord call removal failed (non-blocking):", err));
    }
    if (user?.discordId) await removeFromGuild(user.discordId).catch((err) => console.error("Discord removal failed (non-blocking):", err));
  } catch (err) {
    console.error("Discord cleanup for a deleted account failed (non-blocking):", err);
  }
}
