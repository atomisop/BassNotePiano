import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeUser, newTag, prisma } from "./helpers";

// The action must change the five notification switches and nothing else: a server action receives whatever the browser posts.
const tag = newTag("np");
let me: { id: string; email: string };
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => ({ user: { id: (globalThis as { __npUser?: string }).__npUser } }), getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

beforeAll(async () => {
  me = await makeUser(tag, "Prefs", { role: "STUDENT", notifyEmailSocial: false });
  (globalThis as { __npUser?: string }).__npUser = me.id;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: me.id } });
});

describe("updateNotificationPreferencesAction", () => {
  it("saves the five switches", async () => {
    const { updateNotificationPreferencesAction } = await import("@/app/(dashboard)/account/actions");
    await updateNotificationPreferencesAction({ notifyEmailPayments: false, notifyEmailRoleUpdates: true, notifyEmailSocial: true, notifyEmailReminders: false, notifyEmailClasses: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({
      notifyEmailPayments: false,
      notifyEmailRoleUpdates: true,
      notifyEmailSocial: true,
      notifyEmailReminders: false,
      notifyEmailClasses: true,
    });
  });

  it("ignores every other field a crafted request adds: role, email, emailVerified, sessionVersion", async () => {
    const { updateNotificationPreferencesAction } = await import("@/app/(dashboard)/account/actions");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    const crafted = {
      notifyEmailPayments: true,
      notifyEmailRoleUpdates: true,
      notifyEmailSocial: true,
      notifyEmailReminders: true,
      notifyEmailClasses: true,
      role: "ADMIN",
      email: `${tag}-taken@example.com`,
      emailVerified: new Date(),
      sessionVersion: 99,
    };
    await updateNotificationPreferencesAction(crafted as never);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.role).toBe("STUDENT");
    expect(after.email).toBe(before.email);
    expect(after.emailVerified).toEqual(before.emailVerified);
    expect(after.sessionVersion).toBe(before.sessionVersion);
    expect(after.notifyEmailPayments).toBe(true);
  });

  it("treats anything that is not exactly true as off", async () => {
    const { updateNotificationPreferencesAction } = await import("@/app/(dashboard)/account/actions");
    await updateNotificationPreferencesAction({ notifyEmailPayments: "yes", notifyEmailRoleUpdates: 1, notifyEmailSocial: null, notifyEmailReminders: undefined, notifyEmailClasses: true } as never);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({
      notifyEmailPayments: false,
      notifyEmailRoleUpdates: false,
      notifyEmailSocial: false,
      notifyEmailReminders: false,
      notifyEmailClasses: true,
    });
  });
});
