import { afterAll, describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { sendRegisterInvite } from "@/lib/registerInvite";
import { newTag, prisma } from "./helpers";

const tag = newTag("ri");
const ids: string[] = [];

async function account(label: string) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, name: `Sender ${label}`, passwordHash: "x", emailCanonical: canonicalEmail(email) } });
  ids.push(u.id);
  return u;
}

afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "register-invite:" } } });
  await prisma.rateLimitEvent.deleteMany({ where: { key: { in: ids.map((id) => `register-invite:${id}`) } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("inviting someone to create an account", () => {
  it("sends once, refuses an address that has an account, a bad address, and a repeat within two weeks", async () => {
    const sender = await account("a");
    const friend = await account("friend");
    expect(await sendRegisterInvite(sender.id, "not an email")).toBe("invalid");
    expect(await sendRegisterInvite(sender.id, friend.email)).toBe("exists");
    const target = `${tag}-new@example.test`;
    expect(await sendRegisterInvite(sender.id, ` ${target.toUpperCase()} `)).toBe("sent");
    expect(await sendRegisterInvite(sender.id, target)).toBe("recent");
    const other = await account("b");
    expect(await sendRegisterInvite(other.id, target)).toBe("recent");
    expect(await prisma.auditLog.count({ where: { actorId: sender.id, action: "invite.register" } })).toBe(1);
  });

  it("limits how many a person can send in a day", async () => {
    const sender = await account("c");
    for (let i = 0; i < 10; i++) expect(await sendRegisterInvite(sender.id, `${tag}-many${i}@example.test`)).toBe("sent");
    await expect(sendRegisterInvite(sender.id, `${tag}-many10@example.test`)).rejects.toThrow(/Too many/);
  });
});
