import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendNudge } from "@/lib/nudge";
import { getFriendProfile } from "@/lib/friendProfile";
import { getMeStatus } from "@/lib/meStatus";
import { blockUser } from "@/lib/social";
import { etDayKey } from "@/lib/fingerPractice";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("nd");
let ann: { id: string }, bo: { id: string }, cy: { id: string }, dee: { id: string }, stranger: { id: string };

async function befriend(a: string, b: string) {
  await prisma.friendRequest.create({ data: { senderId: a, receiverId: b, status: "ACCEPTED", respondedAt: new Date() } });
}

beforeAll(async () => {
  ann = await makeUser(tag, "Ann Sender", { username: `${tag}ann` });
  bo = await makeUser(tag, "Bo Friend", { username: `${tag}bo` });
  cy = await makeUser(tag, "Cy Quiet", { username: `${tag}cy`, notifyEmailSocial: false });
  dee = await makeUser(tag, "Dee Done", { username: `${tag}dee` });
  stranger = await makeUser(tag, "Stan Stranger", { username: `${tag}stan` });
  await befriend(ann.id, bo.id);
  await befriend(ann.id, cy.id);
  await befriend(dee.id, ann.id);
  await prisma.fingerPracticeDay.create({ data: { userId: dee.id, day: etDayKey(), seconds: 600, completedAt: new Date() } });
});
afterAll(async () => {
  const ids = [ann.id, bo.id, cy.id, dee.id, stranger.id];
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.rateLimitEvent.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
  await prisma.fingerPracticeDay.deleteMany({ where: { userId: { in: ids } } });
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("nudging a friend to practice", () => {
  it("sends the fixed wording to the friend, as a bell notice and a pending banner", async () => {
    await sendNudge(ann.id, bo.id);
    const rows = await prisma.notification.findMany({ where: { userId: bo.id, type: "FRIEND_NUDGE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Your friend Ann is reminding you to practice");
    expect(rows[0]!.href).toBe("/practice");
    const status = await getMeStatus(bo.id);
    expect(status.pendingNudge?.title).toBe("Your friend Ann is reminding you to practice");
  });
  it("allows two a day per friend and refuses the third", async () => {
    await sendNudge(ann.id, bo.id);
    await expect(sendNudge(ann.id, bo.id)).rejects.toThrow(/twice today/);
    expect(await prisma.notification.count({ where: { userId: bo.id, type: "FRIEND_NUDGE" } })).toBe(2);
  });
  it("refuses a stranger, yourself, and a friend with social notices switched off, without saying why", async () => {
    await expect(sendNudge(ann.id, stranger.id)).rejects.toThrow(/can't nudge/);
    await expect(sendNudge(ann.id, ann.id)).rejects.toThrow(/can't nudge/);
    await expect(sendNudge(ann.id, cy.id)).rejects.toThrow(/can't nudge/);
    expect(await prisma.notification.count({ where: { userId: { in: [stranger.id, cy.id] }, type: "FRIEND_NUDGE" } })).toBe(0);
  });
  it("does not nudge someone who already finished today's practice", async () => {
    await expect(sendNudge(ann.id, dee.id)).rejects.toThrow(/already finished/);
  });
  it("stops once either side blocks the other", async () => {
    await blockUser(bo.id, ann.id);
    await expect(sendNudge(ann.id, bo.id)).rejects.toThrow(/can't nudge/);
  });
});

describe("a friend's profile", () => {
  it("shows practice and badges to an accepted friend and nothing private", async () => {
    const profile = await getFriendProfile(ann.id, `${tag}dee`);
    expect(profile?.name).toBe("Dee Done");
    expect(profile?.practicedToday).toBe(true);
    expect(JSON.stringify(profile)).not.toMatch(/example\.com|passwordHash|phone/);
  });
  it("answers a stranger, a missing person and a blocked friend the same way: nothing", async () => {
    expect(await getFriendProfile(ann.id, `${tag}stan`)).toBeNull();
    expect(await getFriendProfile(ann.id, "nobody_here_xyz")).toBeNull();
    expect(await getFriendProfile(ann.id, `${tag}bo`)).toBeNull();
    expect(await getFriendProfile(ann.id, `${tag}ann`)).toBeNull();
  });
});
