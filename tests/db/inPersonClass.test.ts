import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.DISCORD_BOT_TOKEN = "test-token";
});
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
const createClassChannel = vi.fn(async (..._a: unknown[]) => "channel-new");
const deleteChannel = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/discordApi", async (orig) => ({
  ...(await orig<typeof import("@/lib/discordApi")>()),
  createClassChannel: (...a: unknown[]) => createClassChannel(...a),
  deleteChannel: (...a: unknown[]) => deleteChannel(...a),
  isGuildMember: async () => true,
  moveToVoiceChannel: async () => undefined,
}));
import { setClassInPerson } from "@/lib/classScheduleAdmin";
import { ClassBookingError } from "@/lib/classSchedule";
import { handler } from "../../netlify/functions/discord-class-channels";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ip");
let sched: { id: string };
const users: string[] = [];

beforeAll(async () => {
  sched = await prisma.classSchedule.create({ data: { dayOfWeek: 1, startTime: "10:00", durationMin: 45, creditCost: 2, label: `${tag} class` } });
});
beforeEach(() => {
  createClassChannel.mockClear();
  deleteChannel.mockClear();
});
afterAll(async () => {
  await prisma.classBooking.deleteMany({ where: { studentId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.classSchedule.delete({ where: { id: sched.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

let day = 0;
async function booking(name: string, startsInMin: number, extra: Record<string, unknown> = {}) {
  const stu = await makeUser(tag, name, { discordId: `${tag}-${name}`.slice(0, 30) });
  users.push(stu.id);
  const at = new Date(Date.now() + startsInMin * 60_000);
  const b = await prisma.classBooking.create({
    data: { studentId: stu.id, scheduleId: sched.id, occurrenceDate: new Date(Date.UTC(2030, 0, 1 + day++)), scheduledAt: at, creditsSpent: 2, ...extra },
  });
  return { stu, b };
}

describe("an in-person class has no Discord call", () => {
  it("flipping to in person closes an open call, tells the student, and flipping back allows a call again", async () => {
    const { stu, b } = await booking("flip", 120, { discordChannelId: "channel-old" });
    await setClassInPerson(b.id, true);
    let row = await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.inPerson).toBe(true);
    expect(row.discordChannelId).toBeNull();
    expect(deleteChannel).toHaveBeenCalledWith("channel-old");
    expect(await prisma.notification.findFirst({ where: { userId: stu.id, title: "Your class is in person" } })).toBeTruthy();
    await setClassInPerson(b.id, false);
    row = await prisma.classBooking.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.inPerson).toBe(false);
    expect(await prisma.notification.findFirst({ where: { userId: stu.id, title: "Your class is online" } })).toBeTruthy();
  });

  it("the call job opens a call for an online class and skips the in-person one", async () => {
    const online = await booking("online", 3);
    const inPerson = await booking("inperson", 3, { inPerson: true });
    await handler({} as never, {} as never, () => undefined);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: online.b.id } })).discordChannelId).toBe("channel-new");
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: inPerson.b.id } })).discordChannelId).toBeNull();
  });

  it("a whole family class changes together, and a finished or canceled class cannot be switched", async () => {
    const a = await booking("fam-a", 120, { familyBookingGroupId: `${tag}-grp` });
    const c = await booking("fam-b", 120, { familyBookingGroupId: `${tag}-grp` });
    await setClassInPerson(a.b.id, true);
    expect((await prisma.classBooking.findUniqueOrThrow({ where: { id: c.b.id } })).inPerson).toBe(true);
    const over = await booking("over", -120);
    await expect(setClassInPerson(over.b.id, true)).rejects.toBeInstanceOf(ClassBookingError);
    const canceled = await booking("canceled", 120, { status: "CANCELED" });
    await expect(setClassInPerson(canceled.b.id, true)).rejects.toBeInstanceOf(ClassBookingError);
  });
});
