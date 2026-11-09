import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { askParentAboutClass, listClassesToAskAbout } from "@/lib/parentAsk";
import { parentMoveHref } from "@/lib/bellAnswers";
import { resetRateLimitBackend } from "@/lib/rateLimit";
import { newTag, prisma } from "./helpers";

// "Ask my parent to move or skip this": a parent-controlled child asks about one class, and every linked parent gets a notice that opens
// that class's move picker. Asking again about the same class is a quiet no-op.
const tag = newTag("pq");
const userIds: string[] = [];
const slotIds: string[] = [];
const DAY = 86_400_000;

async function account(label: string, name: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  userIds.push(u.id);
  return u;
}
async function classFor(studentId: string, inDays: number) {
  const slot = await prisma.classSchedule.create({ data: { dayOfWeek: 3, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} ${slotIds.length}` } });
  slotIds.push(slot.id);
  const at = new Date(Date.now() + inDays * DAY);
  return prisma.classBooking.create({ data: { studentId, scheduleId: slot.id, occurrenceDate: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), scheduledAt: at, creditsSpent: 2 } });
}
async function family() {
  const parent = await account(`p${userIds.length}`, "Parent Tester");
  const child = await account(`c${userIds.length}`, "Kiddo Tester");
  await prisma.parentLink.create({ data: { parentId: parent.id, childId: child.id, status: "ACCEPTED", respondedAt: new Date() } });
  return { parent, child };
}

afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.classSchedule.deleteMany({ where: { id: { in: slotIds } } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: userIds } }, { childId: { in: userIds } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("asking a parent to move or skip a class", () => {
  it("tells the parent with a link that opens that class's move picker, once", async () => {
    resetRateLimitBackend();
    const { parent, child } = await family();
    const booking = await classFor(child.id, 3);
    expect((await listClassesToAskAbout(child.id)).classes).toEqual([expect.objectContaining({ id: booking.id, asked: false })]);

    expect(await askParentAboutClass(child.id, booking.id)).toBe("asked");
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: parent.id, type: "PARENT_CLASS_ASK" } });
    expect(notice.href).toBe(parentMoveHref(child.id, booking.id));
    expect(notice.title).toMatch(/Kiddo asked you to move or skip a class/);

    // Asked again: nothing new is sent, and the class shows as asked.
    expect(await askParentAboutClass(child.id, booking.id)).toBe("already");
    expect(await prisma.notification.count({ where: { userId: parent.id, type: "PARENT_CLASS_ASK" } })).toBe(1);
    expect((await listClassesToAskAbout(child.id)).classes[0]).toMatchObject({ asked: true });
  });

  it("only for the child's own class still to come, and only while a parent is linked", async () => {
    resetRateLimitBackend();
    const { child } = await family();
    const stranger = await account("s", "Other Tester");
    const theirs = await classFor(stranger.id, 2);
    await expect(askParentAboutClass(child.id, theirs.id)).rejects.toThrow(/no longer coming up/);
    const past = await classFor(child.id, -2);
    await expect(askParentAboutClass(child.id, past.id)).rejects.toThrow(/no longer coming up/);
    // No parent linked: nobody to ask.
    const ownClass = await classFor(stranger.id, 4);
    await expect(askParentAboutClass(stranger.id, ownClass.id)).rejects.toThrow(/No parent/);
    expect((await listClassesToAskAbout(stranger.id)).classes).toEqual([]);
  });

  it("is limited to a few a day", async () => {
    resetRateLimitBackend();
    const { child } = await family();
    let refused = 0;
    for (let i = 1; i <= 8; i++) {
      const b = await classFor(child.id, i);
      await askParentAboutClass(child.id, b.id).catch((e: Error) => {
        if (/a lot today/.test(e.message)) refused++;
      });
    }
    expect(refused).toBeGreaterThan(0);
  });
});
