import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
const sent: string[] = [];
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return {
    ...real,
    sendNotificationEmail: async (to: string) => void sent.push(to),
    sendNotificationEmailWithCta: async (to: string) => void sent.push(to),
  };
});
import { createNotification } from "@/lib/notifications";
import { noticeAccountChange, noticeBookingConfirmed } from "@/lib/studentNotices";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ef");
const ids: string[] = [];
beforeEach(() => void (sent.length = 0));
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});
async function person(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(tag, name, extra);
  ids.push(u.id);
  return u;
}

describe("every email follows the matching switch", () => {
  it("class updates follow Class updates, account changes follow Account updates, reminders follow the reminders switch", async () => {
    const off = await person("All Off", { notifyEmailClasses: false, notifyEmailRoleUpdates: false, notifyEmailReminders: false });
    await noticeBookingConfirmed({ studentId: off.id, scheduledAt: new Date(Date.now() + 86_400_000), label: "Monday class", storedCredits: 2 });
    await noticeAccountChange(off.id, { kind: "discord-connected", name: "pat" });
    await createNotification({ userId: off.id, type: "CLASS_REMINDER", title: "Your class is tomorrow", emailCategory: "reminders" });
    expect(sent).toEqual([]);
    // The in-app notices are still written.
    expect(await prisma.notification.count({ where: { userId: off.id } })).toBe(3);

    const on = await person("All On", { notifyEmailReminders: true });
    await noticeBookingConfirmed({ studentId: on.id, scheduledAt: new Date(Date.now() + 86_400_000), label: "Monday class", storedCredits: 2 });
    await noticeAccountChange(on.id, { kind: "discord-connected", name: "pat" });
    await createNotification({ userId: on.id, type: "CLASS_REMINDER", title: "Your class is tomorrow", emailCategory: "reminders" });
    expect(sent).toHaveLength(3);
  });

  it("sends nothing to a banned account, whatever its switches say", async () => {
    const banned = await person("Banned One", { bannedAt: new Date(), notifyEmailReminders: true });
    await createNotification({ userId: banned.id, type: "CLASS_REMINDER", title: "x", emailCategory: "reminders" });
    await createNotification({ userId: banned.id, type: "PAYMENT_APPROVED", title: "y", emailCategory: "payments", alwaysEmail: true });
    expect(sent).toEqual([]);
  });
});
