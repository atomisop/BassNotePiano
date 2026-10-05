import { prisma } from "@/lib/prisma";
import { createNotification, type CreateNotificationParams } from "@/lib/notifications";

/**
 * Which admin-facing notifications reach employees (every admin except the
 * owner). The owner always gets everything; these toggles, set on the
 * Employees page by the owner only, decide what the others get.
 */

export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "isaacberhanu777@gmail.com").toLowerCase();

export const ADMIN_NOTIFICATION_KINDS = [
  { kind: "NEW_REGISTRATION", label: "New class registration", defaultOn: true },
  { kind: "NEW_BOOKING", label: "New class booking", defaultOn: true },
  { kind: "PAYMENT_REVIEW", label: "Payment to review", defaultOn: true },
  { kind: "PAYMENT_AUTO_APPROVED", label: "Payment approved automatically", defaultOn: false },
  { kind: "SUPPORT_CHAT", label: "Support Chat handoffs and messages", defaultOn: true },
  { kind: "PLAN_CANCEL_FEEDBACK", label: "Student canceled their plan", defaultOn: true },
  { kind: "PLAN_LAPSED", label: "Plan canceled for non-payment", defaultOn: false },
  { kind: "OWNER_MESSAGES", label: "Messages sent to the owner account", defaultOn: false },
  { kind: "MUSIC_INBOX", label: "Emails sent to music@bassnotepiano.com", defaultOn: true },
] as const;

export type AdminNotificationKind = (typeof ADMIN_NOTIFICATION_KINDS)[number]["kind"];

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}

export async function getAdminNotificationSettings(): Promise<Record<AdminNotificationKind, boolean>> {
  const rows = await prisma.adminNotificationSetting.findMany();
  const stored = new Map(rows.map((row) => [row.kind, row.employeesEnabled]));
  return Object.fromEntries(
    ADMIN_NOTIFICATION_KINDS.map(({ kind, defaultOn }) => [kind, stored.get(kind) ?? defaultOn]),
  ) as Record<AdminNotificationKind, boolean>;
}

export async function setAdminNotificationSetting(kind: AdminNotificationKind, employeesEnabled: boolean) {
  if (!ADMIN_NOTIFICATION_KINDS.some((k) => k.kind === kind)) throw new Error("Unknown notification.");
  await prisma.adminNotificationSetting.upsert({
    where: { kind },
    update: { employeesEnabled },
    create: { kind, employeesEnabled },
  });
}

/** Admins other than the owner who should get this kind. */
export async function getEmployeeRecipients(kind: AdminNotificationKind): Promise<{ id: string; email: string }[]> {
  const settings = await getAdminNotificationSettings();
  if (!settings[kind]) return [];
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  return admins.filter((admin) => !isOwnerEmail(admin.email));
}

/** The owner plus every employee the owner has switched this kind on for. */
export async function getAdminRecipients(kind: AdminNotificationKind): Promise<{ id: string }[]> {
  const [settings, admins] = await Promise.all([
    getAdminNotificationSettings(),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } }),
  ]);
  const hasOwner = admins.some((admin) => isOwnerEmail(admin.email));
  return admins.filter((admin) => (isOwnerEmail(admin.email) ? true : hasOwner ? settings[kind] : true)).map(({ id }) => ({ id }));
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
