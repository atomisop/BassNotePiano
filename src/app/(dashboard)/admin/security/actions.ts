"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/** Empties the report list (to start a fresh observation window after a fix). Owner only; this check is the real boundary. */
export async function clearCspViolationsAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) return { ok: false, error: "Only the owner can do this." };
  const res = await prisma.cspViolation.deleteMany({});
  await logAudit({ actorId: session.user.id, actorEmail: session.user.email, action: "security.csp.clear", detail: `${res.count} report rows cleared` });
  revalidatePath("/admin/security");
  return { ok: true };
}
