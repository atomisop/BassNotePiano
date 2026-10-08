"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { resetSetting, saveSetting } from "@/lib/siteSettings";
import { SETTING_BY_KEY } from "@/lib/siteSettingsDefs";

type Result = { ok: true; value: boolean | number | string } | { ok: false; error: string };

// Server Actions are separate endpoints the admin layout never guards, so this is the real check.
async function requireOwner() {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) throw new Error("Only the owner can change settings.");
  return session.user;
}

export async function saveSettingAction(key: string, value: boolean | number | string): Promise<Result> {
  try {
    const admin = await requireOwner();
    const def = SETTING_BY_KEY[key];
    if (!def) throw new Error("Unknown setting.");
    await saveSetting(key, value);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "setting.set", targetType: "setting", targetId: key, detail: `${def.label}: ${String(value)}` });
    revalidatePath("/admin/settings");
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
}

export async function resetSettingAction(key: string): Promise<Result> {
  try {
    const admin = await requireOwner();
    const def = SETTING_BY_KEY[key];
    if (!def) throw new Error("Unknown setting.");
    await resetSetting(key);
    await logAudit({ actorId: admin.id, actorEmail: admin.email, action: "setting.reset", targetType: "setting", targetId: key, detail: `${def.label}: back to ${String(def.default)}` });
    revalidatePath("/admin/settings");
    return { ok: true, value: def.default };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reset." };
  }
}
