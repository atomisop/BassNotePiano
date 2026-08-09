"use server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function markPatchNotesSeenAction(): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenPatchNotesAt: new Date() },
  });
}

/** Called on skip/finish, whether the tour opened automatically or was replayed manually from Settings — idempotent either way. */
export async function markOnboardingTourSeenAction(): Promise<void> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingTourSeenAt: new Date() },
  });
}
