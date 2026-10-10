"use server";

import { noticeAccountChange } from "@/lib/studentNotices";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Disconnects the signed-in student's own Discord account. */
export async function unlinkDiscordAction() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login?callbackUrl=/lessons");
  const before = await prisma.user.findUnique({ where: { id: session.user.id }, select: { discordId: true } });
  await prisma.user.update({ where: { id: session.user.id }, data: { discordId: null, discordUsername: null } });
  if (before?.discordId) await noticeAccountChange(session.user.id, { kind: "discord-disconnected", by: "you" });
  // The whole app shell: the lessons card, settings, the top banner and the admin list all read the link.
  revalidatePath("/", "layout");
}
