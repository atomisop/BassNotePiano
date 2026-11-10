import { afterAll, describe, expect, it, vi } from "vitest";
// The export route reads the session: the test signs in as whoever `signedIn` names.
let signedIn: string | null = null;
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => (signedIn ? { user: { id: signedIn } } : null), authOptions: {} }));
import { askToBookTogether, getEmailAsksSent, getPendingRequestsSent, respondToFriendRequest, sendFriendRequest, withdrawEmailAsk } from "@/lib/social";
import { GET as exportMyData } from "@/app/api/account/export/route";
import { sendRegisterInvite } from "@/lib/registerInvite";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("askp");
const ids: string[] = [];

async function student(label: string) {
  const u = await makeUser(`${tag}${label}`, `${label[0].toUpperCase()}${label.slice(1)} Person`, { emailVerified: new Date(), username: `${tag}${label}`.toLowerCase().slice(-20) });
  ids.push(u.id);
  return u;
}
const sentUsernames = async (userId: string) => (await getPendingRequestsSent(userId)).map((r) => r.receiver.username);
async function exportOf(userId: string) {
  signedIn = userId;
  const file = await (await exportMyData()).json();
  signedIn = null;
  return file as { friends: { status: string; receiver: { username: string | null } }[]; askedToBookTogether: { email: string }[] };
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.friendEmailAsk.deleteMany({ where: { senderId: { in: ids } } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("asking to book together never tells whether an email has an account", () => {
  it("a username request already sent stays listed with its profile when that person's email is asked", async () => {
    const asker = await student("one");
    const x = await student("xone");
    await sendFriendRequest(asker.id, x.username!);
    expect(await sentUsernames(asker.id)).toEqual([x.username]);
    await askToBookTogether(asker.id, x.email);
    expect(await sentUsernames(asker.id)).toEqual([x.username]);
    expect((await getEmailAsksSent(asker.id)).map((a) => a.email)).toEqual([x.email.toLowerCase()]);
  });

  it("asking first, then sending by username, shows the username row exactly as it would for anyone else", async () => {
    const asker = await student("two");
    const x = await student("xtwo");
    await askToBookTogether(asker.id, x.email);
    expect(await sentUsernames(asker.id)).toEqual([]);
    await sendFriendRequest(asker.id, x.username!);
    expect(await sentUsernames(asker.id)).toEqual([x.username]);
  });

  it("asking a friend's email leaves the friendship as it is", async () => {
    const asker = await student("three");
    const x = await student("xthree");
    const request = await sendFriendRequest(asker.id, x.username!);
    await respondToFriendRequest(x.id, request.id, true);
    await askToBookTogether(asker.id, x.email);
    expect((await prisma.friendRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("ACCEPTED");
    await expect(sendFriendRequest(asker.id, x.username!)).rejects.toThrow(/already friends/);
  });

  it("requests made by asks do not use up the hourly friend request allowance", async () => {
    const asker = await student("four");
    const people = await Promise.all(Array.from({ length: 3 }, (_, i) => student(`xfour${i}`)));
    for (const p of people) await askToBookTogether(asker.id, p.email);
    expect(await prisma.friendRequest.count({ where: { senderId: asker.id } })).toBe(3);
    // The allowance is 20 an hour: with the 3 ask requests left out, 20 more by username still go through.
    const others = await Promise.all(Array.from({ length: 20 }, (_, i) => student(`yfour${i}`)));
    for (const o of others) await sendFriendRequest(asker.id, o.username!);
    expect(await prisma.friendRequest.count({ where: { senderId: asker.id } })).toBe(23);
  });

  it("a request they declined earlier is never reopened or hidden by an ask, so the export does not change", async () => {
    const asker = await student("six");
    const x = await student("xsix");
    const request = await sendFriendRequest(asker.id, x.username!);
    await respondToFriendRequest(x.id, request.id, false);
    const before = (await exportOf(asker.id)).friends;
    expect(before.map((r) => [r.status, r.receiver.username])).toEqual([["REJECTED", x.username]]);
    await askToBookTogether(asker.id, x.email);
    expect((await exportOf(asker.id)).friends).toEqual(before);
    expect((await prisma.friendRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("REJECTED");
  });

  it("withdrawing an ask whose request was declined leaves nothing behind in the export", async () => {
    const asker = await student("seven");
    const x = await student("xseven");
    await askToBookTogether(asker.id, x.email);
    const made = await prisma.friendRequest.findFirstOrThrow({ where: { senderId: asker.id, receiverId: x.id } });
    await respondToFriendRequest(x.id, made.id, false);
    const ask = (await getEmailAsksSent(asker.id))[0];
    await withdrawEmailAsk(asker.id, ask.id);
    expect((await exportOf(asker.id)).friends).toEqual([]);
    expect(await prisma.friendRequest.findUnique({ where: { id: made.id } })).toBeNull();
  });

  it("a full hourly friend request allowance does not change an ask's answer", async () => {
    const asker = await student("eight");
    const others = await Promise.all(Array.from({ length: 20 }, (_, i) => student(`yeight${i}`)));
    for (const o of others) await sendFriendRequest(asker.id, o.username!);
    const x = await student("xeight");
    await expect(askToBookTogether(asker.id, x.email)).resolves.toBe("asked");
    await expect(askToBookTogether(asker.id, `${tag}-eight-nobody@example.com`)).resolves.toBe("asked");
  });

  it("a spent sign-up invitation limit does not change an ask's answer for an address with no account", async () => {
    const asker = await student("nine");
    // Use up the invitation limit (10 a day) with other addresses.
    for (let i = 0; i < 10; i++) await sendRegisterInvite(asker.id, `${tag}-nine-fill${i}@example.com`);
    await expect(sendRegisterInvite(asker.id, `${tag}-nine-more@example.com`)).rejects.toThrow();
    await expect(askToBookTogether(asker.id, `${tag}-nine-nobody@example.com`)).resolves.toBe("asked");
    expect((await getEmailAsksSent(asker.id)).map((a) => a.email)).toEqual([`${tag}-nine-nobody@example.com`]);
  });

  it("the data export lists asks by the typed email, never the account a request went to, until it is accepted", async () => {
    const asker = await student("five");
    const x = await student("xfive");
    await askToBookTogether(asker.id, x.email);
    await askToBookTogether(asker.id, `${tag}-nobody@example.com`);
    signedIn = asker.id;
    const file = await (await exportMyData()).json();
    signedIn = null;
    expect(file.friends).toEqual([]);
    expect(file.askedToBookTogether.map((a: { email: string }) => a.email).sort()).toEqual([x.email.toLowerCase(), `${tag}-nobody@example.com`].sort());
    // No row anywhere names the account behind the email (the account section is the asker's own).
    expect(JSON.stringify({ ...file, account: null })).not.toContain(`"${x.username}"`);
  });
});
