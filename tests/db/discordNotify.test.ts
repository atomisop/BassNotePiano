import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { notifyToConnectDiscord } from "@/lib/accountDiscordNotify";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("dn");
const ids: string[] = [];
async function student(name: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(tag, name, extra);
  ids.push(u.id);
  return u;
}
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("the Notify button on the Discord page", () => {
  it("emails the steps and leaves an in-app notice for someone who has not connected", async () => {
    const u = await student("Not Linked");
    expect(await notifyToConnectDiscord(u.id)).toBe("sent");
    const note = await prisma.notification.findFirst({ where: { userId: u.id, title: "Connect your Discord" } });
    expect(note?.body).toMatch(/1\. Download the free Discord app on your phone\. 2\. Create a Discord account at discord\.com\/register\. 3\. Open Lessons/);
    expect(note?.body).not.toMatch(/—|–/);
  });
  it("only leaves the in-app notice when they turned account update emails off", async () => {
    const u = await student("No Email", { notifyEmailRoleUpdates: false });
    expect(await notifyToConnectDiscord(u.id)).toBe("opted-out");
    expect(await prisma.notification.count({ where: { userId: u.id, title: "Connect your Discord" } })).toBe(1);
  });
  it("does nothing for someone already connected or banned", async () => {
    const linked = await student("Linked", { discordId: `d${tag}` });
    expect(await notifyToConnectDiscord(linked.id)).toBe("already-connected");
    const banned = await student("Banned", { bannedAt: new Date() });
    expect(await notifyToConnectDiscord(banned.id)).toBe("banned");
    expect(await prisma.notification.count({ where: { userId: { in: [linked.id, banned.id] } } })).toBe(0);
  });
});
