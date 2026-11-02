import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerSession: async () => null, getServerAuthSession: async () => null, authOptions: {} }));
import { canonicalEmail } from "@/lib/canonicalEmail";
import { expireSettledGroupStarts } from "@/lib/groupStartCleanup";
import { purgeOldJobRuns, JOB_RUN_KEEP_DAYS } from "@/lib/jobRun";
import { newTag, prisma } from "./helpers";

const tag = newTag("gsc");
const DAY = 86_400_000;
const emails: string[] = [];
const groupIds: string[] = [];
const jobNames: string[] = [];

async function family(paid: number[]) {
  const people = [];
  for (let i = 0; i < paid.length; i++) {
    const email = `${tag}-m${emails.length}@example.test`;
    emails.push(email);
    people.push(await prisma.user.create({ data: { email, name: `Member${emails.length} Tester`, passwordHash: "x", emailCanonical: canonicalEmail(email) } }));
  }
  const g = await prisma.familyPlanGroup.create({ data: { payerId: people[0].id, kind: "FAMILY" } });
  groupIds.push(g.id);
  for (const [i, p] of people.entries()) {
    await prisma.paymentPlan.create({
      data: { userId: p.id, cadence: "MIN_60_WEEKLY", term: "TERM_6", installmentAmountCents: 15000, creditsPerInstallment: 8, termMonths: 6, installmentsPaid: paid[i], nextDueDate: new Date(Date.now() + 10 * DAY), familyGroupId: g.id },
    });
  }
  const start = await prisma.zellePayment.create({
    data: { userId: people[0].id, purpose: "FAMILY_PLAN_START", amountCents: 30000, zelleHandle: "t@example.test", familyGroupId: g.id, status: "AWAITING_TRANSFER" },
  });
  return start;
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.zellePayment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentPlan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyPlanGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.jobRun.deleteMany({ where: { name: { in: jobNames } } });
});

describe("a group's combined first payment", () => {
  it("is closed once every member is already paid for, and left alone while anyone is still waiting", async () => {
    const settled = await family([1, 1]);
    const waiting = await family([1, 0]);
    await expireSettledGroupStarts();
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: settled.id } })).status).toBe("EXPIRED");
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("AWAITING_TRANSFER");
  });

  it("never closes one that was already submitted for review", async () => {
    const start = await family([1, 1]);
    await prisma.zellePayment.update({ where: { id: start.id }, data: { status: "AWAITING_TRANSFER", submittedAt: new Date() } });
    await expireSettledGroupStarts();
    expect((await prisma.zellePayment.findUniqueOrThrow({ where: { id: start.id } })).status).toBe("AWAITING_TRANSFER");
  });
});

describe("old job run records", () => {
  it("are removed after the keep window and newer ones stay", async () => {
    const name = `${tag}-job`;
    jobNames.push(name);
    await prisma.jobRun.create({ data: { name, ok: true, ranAt: new Date(Date.now() - (JOB_RUN_KEEP_DAYS + 2) * DAY) } });
    await prisma.jobRun.create({ data: { name, ok: true, ranAt: new Date(Date.now() - 2 * DAY) } });
    await purgeOldJobRuns();
    expect(await prisma.jobRun.count({ where: { name } })).toBe(1);
  });
});
