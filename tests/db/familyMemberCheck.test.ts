import { afterAll, describe, expect, it } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { checkFamilyMember } from "@/lib/familyMemberCheck";
import { newTag, prisma } from "./helpers";

const tag = newTag("fmc");
const ids: string[] = [];

async function account(label: string, data: { name: string | null; role?: "STUDENT" | "ADMIN"; bannedAt?: Date }) {
  const email = `${tag}-${label}@example.test`;
  const u = await prisma.user.create({ data: { email, passwordHash: "x", emailCanonical: canonicalEmail(email), ...data } });
  ids.push(u.id);
  return u;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("checkFamilyMember", () => {
  it("answers for each kind of email", async () => {
    const payer = await account("payer", { name: "Parent Tester" });
    const ok = await account("ok", { name: "Child Tester" });
    const noLast = await account("nolast", { name: "Child" });
    const banned = await account("banned", { name: "Banned Person", bannedAt: new Date() });
    const admin = await account("admin", { name: "Admin Person", role: "ADMIN" });

    expect(await checkFamilyMember(payer.id, ok.email)).toBe("ready");
    expect(await checkFamilyMember(payer.id, ` ${ok.email.toUpperCase()} `)).toBe("ready");
    expect(await checkFamilyMember(payer.id, noLast.email)).toBe("needs_name");
    expect(await checkFamilyMember(payer.id, banned.email)).toBe("no_account");
    expect(await checkFamilyMember(payer.id, admin.email)).toBe("no_account");
    expect(await checkFamilyMember(payer.id, payer.email)).toBe("self");
    expect(await checkFamilyMember(payer.id, `${tag}-nobody@example.test`)).toBe("no_account");
    expect(await checkFamilyMember(payer.id, "not an email")).toBe("invalid");
  });
});
