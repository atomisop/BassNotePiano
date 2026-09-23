"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import {
  createAnnouncement,
  setAnnouncementActive,
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
    revalidatePath("/admin/announcements");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}

export async function setAnnouncementActiveAction(id: string, active: boolean) {
  try {
    await requireAdminId();
    await setAnnouncementActive(id, active);
    revalidatePath("/admin/announcements");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}

export async function deleteAnnouncementAction(id: string) {
  try {
    await requireAdminId();
    await deleteAnnouncement(id);
    revalidatePath("/admin/announcements");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof AnnouncementError ? err.message : "Something went wrong." };
  }
}
