import { afterAll, describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { groupSentNotices, listSentNotices, type NoticeFilter } from "@/lib/adminNotices";
import { newTag, prisma } from "./helpers";

const tag = newTag("sn");
const ids: string[] = [];

async function account(label: string, role: "STUDENT" | "ADMIN" = "STUDENT") {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: `Person ${label}`, passwordHash: "x", emailCanonical: canonicalEmail(email), role } });
  ids.push(u.id);
  return u;
}
const base: NoticeFilter = { q: "", channel: "all", who: "all", days: 30, userId: "", page: 1 };

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mailMessage.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("what was sent to whom", () => {
  it("lists bell notices and Mail messages together, filters them, and counts a broadcast by message", async () => {
    const a = await account("a");
    const b = await account("b");
    const chief = await account("chief", "ADMIN");
    const title = `${tag} bills every 28 days`;
    for (const u of [a, b]) await prisma.notification.create({ data: { userId: u.id, type: "PAYMENT_PLAN_UPDATED", title, body: "Plans are billed every 28 days." } });
    await prisma.mailMessage.create({ data: { userId: a.id, kind: "PAYMENT", title: `${tag} receipt`, body: "Thanks", readAt: new Date() } });
    await prisma.notification.create({ data: { userId: chief.id, type: "ADMIN_ALERT", title: `${tag} alert for admins`, body: null } });

    const all = await listSentNotices({ ...base, q: tag });
    expect(all.total).toBe(4);
    expect(all.rows.map((r) => r.channel).sort()).toEqual(["bell", "bell", "bell", "mail"]);

    expect((await listSentNotices({ ...base, q: tag, channel: "mail" })).rows.map((r) => r.title)).toEqual([`${tag} receipt`]);
    expect((await listSentNotices({ ...base, q: tag, who: "admins" })).rows.map((r) => r.userId)).toEqual([chief.id]);
    expect((await listSentNotices({ ...base, q: tag, who: "students" })).total).toBe(3);
    expect((await listSentNotices({ ...base, userId: a.id })).total).toBe(2);
    expect((await listSentNotices({ ...base, q: `person b` })).rows.map((r) => r.userId)).toEqual([b.id]);
    const receipt = (await listSentNotices({ ...base, q: `${tag} receipt` })).rows[0];
    expect(receipt.read).toBe(true);
    expect(receipt.kind).toBe("Payment");

    const groups = await groupSentNotices({ ...base, q: tag });
    expect(groups.find((g) => g.title === title)).toMatchObject({ channel: "bell", count: 2 });
  });

  it("only looks as far back as asked", async () => {
    const u = await account("old");
    await prisma.notification.create({ data: { userId: u.id, type: "BADGE_EARNED", title: `${tag} long ago`, createdAt: new Date(Date.now() - 100 * 86_400_000) } });
    expect((await listSentNotices({ ...base, userId: u.id, days: 30 })).total).toBe(0);
    expect((await listSentNotices({ ...base, userId: u.id, days: null })).total).toBe(1);
  });
});
