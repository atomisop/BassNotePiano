import { prisma } from "@/lib/prisma";
import { ADMIN_NOTIFICATION_KINDS, type AdminNotificationKind } from "@/lib/adminNotificationKinds";
import { createNotification, type CreateNotificationParams } from "@/lib/notifications";

/**
 * Which admin-facing notifications reach employees (every admin except the
 * owner). The owner always gets everything; these toggles, set on the
 * Employees page by the owner only, decide what the others get.
 */

export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "isaacberhanu777@gmail.com").toLowerCase();

export { ADMIN_NOTIFICATION_GROUPS, ADMIN_NOTIFICATION_KINDS, type AdminNotificationGroup, type AdminNotificationKind } from "@/lib/adminNotificationKinds";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}

export type AdminNotificationSettings = Record<AdminNotificationKind, { owner: boolean; employees: boolean }>;

export async function getAdminNotificationSettings(): Promise<AdminNotificationSettings> {
  const rows = await prisma.adminNotificationSetting.findMany();
  const stored = new Map(rows.map((row) => [row.kind, row]));
  return Object.fromEntries(
    ADMIN_NOTIFICATION_KINDS.map(({ kind, defaultOn }) => {
      const row = stored.get(kind);
      return [kind, { owner: row?.ownerEnabled ?? true, employees: row?.employeesEnabled ?? defaultOn }];
    }),
  ) as AdminNotificationSettings;
}

export async function setAdminNotificationSetting(kind: AdminNotificationKind, who: "owner" | "employees", enabled: boolean) {
  const def = ADMIN_NOTIFICATION_KINDS.find((k) => k.kind === kind);
  if (!def) throw new Error("Unknown notification.");
  if (who === "employees" && def.ownerOnly) throw new Error("Employees never get this one.");
  await prisma.adminNotificationSetting.upsert({
    where: { kind },
    update: who === "owner" ? { ownerEnabled: enabled } : { employeesEnabled: enabled },
    create: { kind, employeesEnabled: who === "employees" ? enabled : def.defaultOn, ownerEnabled: who === "owner" ? enabled : true },
  });
}

/** Admins other than the owner who should get this kind. */
export async function getEmployeeRecipients(kind: AdminNotificationKind): Promise<{ id: string; email: string }[]> {
  if (ADMIN_NOTIFICATION_KINDS.find((k) => k.kind === kind)?.ownerOnly) return [];
  const settings = await getAdminNotificationSettings();
  if (!settings[kind].employees) return [];
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  return admins.filter((admin) => !isOwnerEmail(admin.email));
}

/** The owner (unless they switched it off for themselves) plus every employee the owner has switched this kind on for. */
export async function getAdminRecipients(kind: AdminNotificationKind): Promise<{ id: string }[]> {
  const ownerOnly = ADMIN_NOTIFICATION_KINDS.find((k) => k.kind === kind)?.ownerOnly ?? false;
  const [settings, admins] = await Promise.all([
    getAdminNotificationSettings(),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } }),
  ]);
  const hasOwner = admins.some((admin) => isOwnerEmail(admin.email));
  return admins
    .filter((admin) => {
      if (isOwnerEmail(admin.email)) return settings[kind].owner;
      if (ownerOnly) return false;
      return hasOwner ? settings[kind].employees : true;
    })
    .map(({ id }) => ({ id }));
}

/** Sends one notification to every admin who should get this kind. Never throws. */
export async function notifyAdmins(kind: AdminNotificationKind, params: Omit<CreateNotificationParams, "userId">) {
  try {
    const recipients = await getAdminRecipients(kind);
    await Promise.all(
      recipients.map((admin) =>
        createNotification({ ...params, userId: admin.id }).catch((err) =>
          console.error("Admin notification failed (non-blocking):", err),
        ),
      ),
    );
  } catch (err) {
    console.error("Admin notification lookup failed (non-blocking):", err);
  }
}
