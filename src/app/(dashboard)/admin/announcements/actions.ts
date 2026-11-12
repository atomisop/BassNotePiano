"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createAnnouncement,
  setAnnouncementActive,
  updateAnnouncement,
  deleteAnnouncement,
  AnnouncementError,
} from "@/lib/announcements";

async function requireAdminId(): Promise<string> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) throw new AnnouncementError("Not signed in.");
  if (session.user.role !== "ADMIN") throw new AnnouncementError("Admin access required.");
  return session.user.id;
}

export async function createAnnouncementAction(title: string, body: string, sendEmail: boolean) {
  try {
    const adminId = await requireAdminId();
    await createAnnouncement(adminId, title, body, sendEmail);
    await logAudit({ actorId: adminId, action: "announcement.create", targetType: "Announcement", targetId: "new", detail: `${title}${sendEmail ? " (also emailed)" : ""}` }).catch(() => undefined);
    revalidatePath("/admin/announcements");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}

export async function setAnnouncementActiveAction(id: string, active: boolean) {
  try {
    const adminId = await requireAdminId();
    await setAnnouncementActive(id, active);
    await logAudit({ actorId: adminId, action: "announcement.active", targetType: "Announcement", targetId: id, detail: active ? "Turned on" : "Turned off" }).catch(() => undefined);
    revalidatePath("/admin/announcements");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}

export async function deleteAnnouncementAction(id: string) {
  try {
    const adminId = await requireAdminId();
    await deleteAnnouncement(id);
    await logAudit({ actorId: adminId, action: "announcement.delete", targetType: "Announcement", targetId: id, detail: "Deleted" }).catch(() => undefined);
    revalidatePath("/admin/announcements");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}

export async function updateAnnouncementAction(id: string, title: string, body: string) {
  try {
    const adminId = await requireAdminId();
    await updateAnnouncement(id, title, body);
    await logAudit({ actorId: adminId, action: "announcement.edit", targetType: "Announcement", targetId: id, detail: `Announcement edited: "${title.trim().slice(0, 120)}"` }).catch(() => undefined);
    revalidatePath("/admin/messages");
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}
