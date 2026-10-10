"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { notifyToConnectDiscord } from "@/lib/accountDiscordNotify";

/** Admin only: disconnects one person's Discord account. They can connect again whenever they like. */
export async function disconnectDiscordForUserAction(userId: string): Promise<{ ok: boolean; message: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/discord");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, discordId: true, discordUsername: true } });
  if (!user) return { ok: false, message: "That person no longer exists." };
  if (!user.discordId) return { ok: true, message: "They were already disconnected." };

  await prisma.user.update({ where: { id: user.id }, data: { discordId: null, discordUsername: null } });
  await logAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "discord.disconnect",
    targetType: "User",
    targetId: user.id,
    detail: `Disconnected ${user.email} from Discord (${user.discordUsername ?? "unknown name"})`,
  });
  revalidatePath("/admin/discord");
  revalidatePath("/lessons");
  return { ok: true, message: "Disconnected." };
}

/** Admin only: tells one student to connect Discord, with the steps (email and an in-app notice). */
export async function notifyDiscordAction(userId: string): Promise<{ ok: boolean; message: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/discord");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  try {
    const result = await notifyToConnectDiscord(userId);
    if (result === "banned") return { ok: false, message: "That account is banned." };
    if (result === "already-connected") return { ok: true, message: "They are already connected." };
    await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: "discord.notify", targetType: "User", targetId: userId, detail: result });
    return { ok: true, message: result === "sent" ? "Sent." : "They turned off account update emails, so only the in-app notice was sent." };
  } catch (err) {
    console.error("Discord notify failed:", err);
    return { ok: false, message: "Could not send." };
  }
}
