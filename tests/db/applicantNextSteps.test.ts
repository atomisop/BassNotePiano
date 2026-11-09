import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { findApplicantAccountId, getAdminClassRegistrations, noticeApprovedApplicantJoined, sendApplicantSignUpLink } from "@/lib/classRegistration";
import { newTag, prisma } from "./helpers";

const tag = newTag("apx");
const emails: string[] = [];

async function account(label: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${label}@example.test`;
  emails.push(email);
  return prisma.user.create({ data: { email, name: `${label} Tester`, passwordHash: "x", emailCanonical: canonicalEmail(email), ...extra } });
}
async function application(label: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${label}@example.test`;
  emails.push(email);
  return prisma.classRegistration.create({
    data: { fullName: `${label} Applicant`, email, phone: "+12125550100", instrument: "PIANO_KEYBOARD", skillLevel: "BEGINNER", status: "APPROVED", ...extra },
  });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.classRegistration.deleteMany({ where: { email: { in: emails } } });
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "register-invite:" } } });
  await prisma.rateLimitEvent.deleteMany({ where: { key: { in: ids.flatMap((id) => [`register-invite:${id}`, `register-invite-lookup:${id}`]) } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("an applicant's account on the Applicants card", () => {
  it("finds the account by the application's email, whatever its case", async () => {
    const u = await account("case");
    const upper = `${tag}-CASE@Example.test`;
    emails.push(upper);
    const reg = await application("case", { email: upper });
    const row = (await getAdminClassRegistrations("APPROVED")).find((r) => r.id === reg.id)!;
    expect(row.account?.id).toBe(u.id);
    expect(row.signUpLinkSentAt).toBeNull();
    expect(await findApplicantAccountId(reg.id)).toBe(u.id);
  });

  it("falls back to the account that applied, but never to an admin's", async () => {
    const student = await account("signedin");
    const reg = await application("other", { userId: student.id });
    const admin = await account("owner", { role: "ADMIN" });
    const regByAdmin = await application("tested", { userId: admin.id });
    const rows = await getAdminClassRegistrations("APPROVED");
    expect(rows.find((r) => r.id === reg.id)?.account?.id).toBe(student.id);
    expect(rows.find((r) => r.id === regByAdmin.id)?.account).toBeNull();
  });

  it("marks a banned account and does not offer it for a plan", async () => {
    const u = await account("banned", { bannedAt: new Date() });
    const reg = await application("banned");
    const row = (await getAdminClassRegistrations("APPROVED")).find((r) => r.id === reg.id)!;
    expect(row.account).toMatchObject({ id: u.id, banned: true });
    expect(await findApplicantAccountId(reg.id)).toBeNull();
  });
});

describe("Send sign-up link", () => {
  it("emails an applicant with no account once a day, shows when, and refuses a rejected one or an address with an account", async () => {
    const admin = await account("sender", { role: "ADMIN" });
    const reg = await application("noacct");
    expect(await sendApplicantSignUpLink(reg.id, admin.id)).toBe("sent");
    expect(await sendApplicantSignUpLink(reg.id, admin.id)).toBe("recent");
    const row = (await getAdminClassRegistrations("APPROVED")).find((r) => r.id === reg.id)!;
    expect(row.signUpLinkSentAt).toBeInstanceOf(Date);
    const audit = await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: "invite.register" } });
    expect(audit?.detail).toContain("sign-up link");

    const rejected = await application("nope", { status: "REJECTED" });
    expect(await sendApplicantSignUpLink(rejected.id, admin.id)).toBe("rejected");
    await account("hasone");
    const withAccount = await application("hasone");
    expect(await sendApplicantSignUpLink(withAccount.id, admin.id)).toBe("exists");
    expect(await sendApplicantSignUpLink("missing-id", admin.id)).toBe("gone");
  });
});

describe("an approved applicant making their account", () => {
  it("links the application and tells the studio, with a link to set up their plan", async () => {
    const owner = await account("staffer", { role: "ADMIN" });
    const reg = await application("joiner");
    const u = await account("joiner");
    await noticeApprovedApplicantJoined({ id: u.id, email: u.email, name: u.name });
    expect((await prisma.classRegistration.findUniqueOrThrow({ where: { id: reg.id } })).userId).toBe(u.id);
    const notice = await prisma.notification.findFirst({ where: { userId: owner.id, title: "An approved applicant made their account" } });
    expect(notice?.href).toBe(`/admin/users/${u.id}?do=setup`);
  });

  it("says nothing for someone who never applied or was not approved", async () => {
    const owner = await account("staffer2", { role: "ADMIN" });
    await application("pending", { status: "PENDING" });
    const u = await account("pending");
    await noticeApprovedApplicantJoined({ id: u.id, email: u.email, name: u.name });
    expect(await prisma.notification.count({ where: { userId: owner.id, title: "An approved applicant made their account" } })).toBe(0);
  });
});
