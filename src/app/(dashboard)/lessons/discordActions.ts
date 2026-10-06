"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Disconnects the signed-in student's own Discord account. */
export async function unlinkDiscordAction() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login?callbackUrl=/lessons");
  await prisma.user.update({ where: { id: session.user.id }, data: { discordId: null, discordUsername: null } });
  revalidatePath("/lessons");
}
