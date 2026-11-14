import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, getServerSession: async () => null, authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { resolveGoogleUser } from "@/lib/googleSignIn";
import { makeUser, newTag, prisma } from "./helpers";
import { saveSetting, resetSetting } from "@/lib/siteSettings";

const tag = newTag("gg");
const emails: string[] = [];
const ids: string[] = [];
let n = 0;
const mail = () => {
  const e = `${tag}-${n++}@example.test`;
  emails.push(e);
  return e;
};
const g = (email: string, extra: Partial<{ sub: string; emailVerified: boolean; name: string | null }> = {}) => ({ sub: extra.sub ?? `sub-${tag}-${n++}`, email, emailVerified: extra.emailVerified ?? true, name: extra.name === undefined ? "Zed Tester" : extra.name });

afterAll(async () => {
  const found = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const all = [...ids, ...found.map((u) => u.id)];
  await prisma.account.deleteMany({ where: { userId: { in: all } } });
  await prisma.parentLink.deleteMany({ where: { OR: [{ parentId: { in: all } }, { childId: { in: all } }] } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: all } }, { title: { contains: tag } }] } });
  await prisma.user.deleteMany({ where: { id: { in: all } } });
  await resetSetting("signup.open");
});

describe("sign in with Google", () => {
  it("makes a new student: verified email, no password, a Google link, and a second visit finds the same account", async () => {
    const email = mail();
    const profile = g(email);
    const first = await resolveGoogleUser(profile);
    expect(first).toMatchObject({ ok: true, isNew: true });
    const row = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(row.emailVerified).not.toBeNull();
    expect(row.passwordHash).toBeNull();
    expect(row.role).toBe("STUDENT");
    expect(await prisma.account.count({ where: { userId: row.id, provider: "google", providerAccountId: profile.sub } })).toBe(1);
    const second = await resolveGoogleUser(profile);
    expect(second).toMatchObject({ ok: true, isNew: false });
    expect(second.ok && second.user.id).toBe(row.id);
  });

  it("refuses an email Google has not verified", async () => {
    expect(await resolveGoogleUser(g(mail(), { emailVerified: false }))).toEqual({ ok: false, reason: "unverified" });
  });

  it("signs in an existing, confirmed account by email and links it", async () => {
    const email = mail();
    const u = await makeUser(tag, "Existing", { email, emailVerified: new Date(), passwordHash: "x" });
    ids.push(u.id);
    const out = await resolveGoogleUser(g(email));
    expect(out.ok && out.user.id).toBe(u.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash).toBe("x");
  });

  it("an account nobody confirmed is confirmed by Google and loses the password it was registered with", async () => {
    const email = mail();
    const u = await makeUser(tag, "Unconfirmed", { email, emailVerified: null, passwordHash: "attacker-known" });
    ids.push(u.id);
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionVersion;
    const out = await resolveGoogleUser(g(email));
    expect(out.ok).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.emailVerified).not.toBeNull();
    expect(after.passwordHash).toBeNull();
    expect(after.sessionVersion).toBeGreaterThan(before);
  });

  it("a linked Google id still finds the account after the email changed", async () => {
    const email = mail();
    const u = await makeUser(tag, "Changed", { email, emailVerified: new Date() });
    ids.push(u.id);
    const profile = g(email);
    await resolveGoogleUser(profile);
    const newEmail = mail();
    await prisma.user.update({ where: { id: u.id }, data: { email: newEmail } });
    const out = await resolveGoogleUser({ ...profile, email });
    expect(out.ok && out.user.id).toBe(u.id);
  });

  it("never signs in an admin, a banned or locked account, or a child account", async () => {
    const adminEmail = mail();
    const admin = await makeUser(tag, "Adm", { email: adminEmail, role: "ADMIN", emailVerified: new Date() });
    const bannedEmail = mail();
    const banned = await makeUser(tag, "Ban", { email: bannedEmail, emailVerified: new Date(), bannedAt: new Date() });
    const lockedEmail = mail();
    const locked = await makeUser(tag, "Lock", { email: lockedEmail, emailVerified: new Date(), paymentLockedAt: new Date() });
    const kidEmail = mail();
    const kid = await makeUser(tag, "Kid", { email: kidEmail, emailVerified: new Date() });
    const parent = await makeUser(tag, "Par", { emailVerified: new Date() });
    ids.push(admin.id, banned.id, locked.id, kid.id, parent.id);
    await prisma.parentLink.create({ data: { parentId: parent.id, childId: kid.id, status: "ACCEPTED" } });
    expect(await resolveGoogleUser(g(adminEmail))).toEqual({ ok: false, reason: "admin" });
    expect(await resolveGoogleUser(g(bannedEmail))).toEqual({ ok: false, reason: "banned" });
    expect(await resolveGoogleUser(g(lockedEmail))).toEqual({ ok: false, reason: "locked" });
    expect(await resolveGoogleUser(g(kidEmail))).toEqual({ ok: false, reason: "child" });
  });

  it("makes no new account while sign-ups are closed, but still signs existing people in", async () => {
    const existing = mail();
    const u = await makeUser(tag, "Open", { email: existing, emailVerified: new Date() });
    ids.push(u.id);
    await saveSetting("signup.open", "false");
    expect(await resolveGoogleUser(g(mail()))).toEqual({ ok: false, reason: "closed" });
    expect((await resolveGoogleUser(g(existing))).ok).toBe(true);
    await resetSetting("signup.open");
  });

  it("copies Google's picture into the new account, and never replaces a photo the account already has", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const fetchMock = vi.fn(async (_url: string) => new Response(png, { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const email = mail();
      const profile = { ...g(email), picture: "https://lh3.googleusercontent.com/a/ABC=s96-c" };
      await resolveGoogleUser(profile);
      const row = await prisma.user.findFirstOrThrow({ where: { email } });
      expect(row.image).toBe(`data:image/png;base64,${png.toString("base64")}`);
      expect(String(fetchMock.mock.calls[0][0])).toBe("https://lh3.googleusercontent.com/a/ABC=s128-c");

      // An account with its own uploaded photo keeps it.
      const ownEmail = mail();
      const own = await makeUser(tag, "Photo", { email: ownEmail, emailVerified: new Date() });
      ids.push(own.id);
      await prisma.user.update({ where: { id: own.id }, data: { image: "data:image/png;base64,AAAA" } });
      await resolveGoogleUser({ ...g(ownEmail), picture: "https://lh3.googleusercontent.com/a/XYZ=s96-c" });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: own.id } })).image).toBe("data:image/png;base64,AAAA");

      // A picture from anywhere else is never fetched, and sign-in still works.
      fetchMock.mockClear();
      const other = mail();
      expect(await resolveGoogleUser({ ...g(other), picture: "https://evil.example.com/p.png" })).toMatchObject({ ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
