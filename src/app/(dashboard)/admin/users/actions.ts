"use server";

import { withStudentNotice } from "@/lib/notifyScope";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { setUserRole, setCurriculumAccess } from "@/lib/admin";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { unlockScaleForUser, lockScaleForUser } from "@/lib/access";
import { clearPersistedHistory } from "@/lib/assistant";
import { approveNextScale, ScaleApprovalError, sendScaleUnlockedNotice } from "@/lib/scaleApproval";
import { getAdminProgressOverview } from "@/lib/admin";

// Same pattern as admin/payments/actions.ts, the admin layout's redirect
// only protects rendering, not these Server Actions, so this re-check is
// the actual authorization boundary.
async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/users");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

export async function setUserRoleAction(targetUserId: string, role: Role, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    if (targetUserId === admin.id && role !== "ADMIN") {
      // Prevents an easy self-lockout, removing your own admin role has to
      // happen from another admin account or directly against the DB.
      throw new Error("You can't remove your own admin role from this panel.");
    }
    // Admin access is the owner's to give and take. An employee can change a student's
    // details but never promote, demote or touch another admin, and nobody can change the owner.
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, role: true } });
    if (!target) throw new Error("That account doesn't exist.");
    if (isOwnerEmail(target.email) && role !== "ADMIN") throw new Error("The owner account can't lose admin access.");
    if ((role === "ADMIN" || target.role === "ADMIN") && !isOwnerEmail(admin.email)) {
      throw new Error("Only the owner can change admin access.");
    }
    await setUserRole(targetUserId, role);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "user.role", targetType: "User", targetId: targetUserId, detail: `${target.email} is now ${role}` });
    revalidatePath("/", "layout");
  });
}

export async function setCurriculumAccessAction(targetUserId: string, hasAccess: boolean, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    // Free access is value given away: only the owner grants it (anyone may remove it).
    if (hasAccess && !isOwnerEmail(admin.email)) redirect("/admin/users");
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
    await setCurriculumAccess(targetUserId, hasAccess);
    await logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: hasAccess ? "access.grant" : "access.revoke",
      targetType: "User",
      targetId: targetUserId,
      detail: `${hasAccess ? "Complimentary access given to" : "Complimentary access removed from"} ${target?.email ?? targetUserId}`,
    });
    revalidatePath("/", "layout");
  });
}

export async function toggleScaleUnlockAction(targetUserId: string, scaleSlug: string, unlock: boolean, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "scale.release", targetType: "User", targetId: targetUserId, detail: `${unlock ? "Unlocked" : "Locked"} ${scaleSlug} by hand` });
    if (unlock) {
      // Opening a scale by hand tells the student the same way a teacher approval does (only when it was not open already).
      const wasOpen = await prisma.scaleProgress.findFirst({ where: { userId: targetUserId, scaleGroup: { slug: scaleSlug }, unlockedAt: { not: null } }, select: { id: true } });
      await unlockScaleForUser(targetUserId, scaleSlug);
      if (!wasOpen) await sendScaleUnlockedNotice(targetUserId, scaleSlug);
    } else {
      await lockScaleForUser(targetUserId, scaleSlug);
    }
    revalidatePath("/", "layout");
  });
}

/**
 * The teacher's "release the next scale" click. Errors the rules raise
 * (previous scale unfinished, weekly pace, no active plan) are shown as
 * plain messages; `force` is the teacher deliberately going past them.
 */
export async function approveNextScaleAction(targetUserId: string, force: boolean, notify = true) {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    try {
      await approveNextScale(targetUserId, { force });
      await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "scale.release", targetType: "User", targetId: targetUserId, detail: force ? "Released the next scale (past the usual rules)" : "Released the next scale" });
    } catch (err) {
      if (err instanceof ScaleApprovalError) throw new Error(err.message);
      throw err;
    }
    revalidatePath("/", "layout");
  });
}

/**
 * "Approve all ready": releases the next scale for every student who is ready for it under the normal
 * rules (previous scale finished, a week since the last unlock). Never forces anyone past a rule, and a
 * failure for one student does not stop the rest.
 */
export async function approveAllReadyScalesAction(notify = true): Promise<{ message: string }> {
  return withStudentNotice(notify, async () => {
    const admin = await requireAdmin();
    const progress = await getAdminProgressOverview("");
    const ready = progress.filter((p) => p.hasCurriculumAccess && p.accessKind !== "ADMIN" && p.nextApproval.state === "READY");
    let approved = 0;
    let skipped = 0;
    for (const student of ready) {
      try {
        await approveNextScale(student.id, { force: false });
        approved++;
      } catch (err) {
        if (!(err instanceof ScaleApprovalError)) throw err;
        skipped++;
      }
    }
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "scale.release", targetType: "User", targetId: admin.id, detail: `Approve all ready: released for ${approved}, ${skipped} skipped` });
    revalidatePath("/", "layout");
    const base = approved === 1 ? "Released the next scale for 1 student." : `Released the next scale for ${approved} students.`;
    return { message: skipped > 0 ? `${base} ${skipped} could not be released (see their row).` : base };
  });
}

// Per direct instruction: a signed-in visitor's Atom conversation is kept
// permanently unless the studio chooses to clear it, there's no
// self-service "clear my chat" for the student, only this admin action.
export async function clearAssistantHistoryAction(targetUserId: string) {
  const admin = await requireAdmin();
  await clearPersistedHistory(targetUserId);
  await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "assistant.clear-history", targetType: "User", targetId: targetUserId, detail: "Cleared their saved Atom chats" });
  revalidatePath("/", "layout");
}
