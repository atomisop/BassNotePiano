import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { approveNextScale, ScaleApprovalError } from "@/lib/scaleApproval";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("sa");
const ids: string[] = [];
let n = 0;

async function student(extra: Record<string, unknown> = { hasCurriculumAccess: true }) {
  const u = await makeUser(`${tag}${n++}`, "Scale Student", extra);
  ids.push(u.id);
  return u;
}
async function scale(order: number) {
  return prisma.scaleGroup.findFirstOrThrow({ where: { order } });
}
async function progress(userId: string, order: number, data: { status: "COMPLETED" | "AVAILABLE"; unlockedAt: Date | null }) {
  const sg = await scale(order);
  await prisma.scaleProgress.create({ data: { userId, scaleGroupId: sg.id, status: data.status, unlockedAt: data.unlockedAt, completedAt: data.status === "COMPLETED" ? new Date() : null } });
}
const unlocked = async (userId: string, order: number) => {
  const sg = await scale(order);
  const row = await prisma.scaleProgress.findUnique({ where: { userId_scaleGroupId: { userId, scaleGroupId: sg.id } } });
  return Boolean(row?.unlockedAt);
};

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.scaleProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("approveNextScale", () => {
  it("refuses a student with no plan or complimentary access", async () => {
    const u = await student({});
    await expect(approveNextScale(u.id)).rejects.toBeInstanceOf(ScaleApprovalError);
    expect(await unlocked(u.id, 1)).toBe(false);
  });

  it("refuses until the previous scale's checklist is complete, unless forced", async () => {
    const u = await student();
    await expect(approveNextScale(u.id)).rejects.toThrow(/previous scale/);
    expect(await unlocked(u.id, 1)).toBe(false);
    await approveNextScale(u.id, { force: true });
    expect(await unlocked(u.id, 1)).toBe(true);
  });

  it("releases the next scale once the previous is complete and a week has passed, and tells the student", async () => {
    const u = await student();
    await progress(u.id, 0, { status: "COMPLETED", unlockedAt: new Date(Date.now() - 9 * 86_400_000) });
    const slug = await approveNextScale(u.id);
    expect(slug).toBe((await scale(1)).slug);
    expect(await unlocked(u.id, 1)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: u.id, type: "CURRICULUM_ACCESS_GRANTED" } })).toBe(1);
    // The scale just released is not finished, so the one after it needs the checklist again.
    await expect(approveNextScale(u.id)).rejects.toBeInstanceOf(ScaleApprovalError);
  });

  it("holds to one new scale a week unless forced", async () => {
    const u = await student();
    await progress(u.id, 0, { status: "COMPLETED", unlockedAt: new Date() });
    await expect(approveNextScale(u.id)).rejects.toThrow(/One new scale per week/);
    expect(await unlocked(u.id, 1)).toBe(false);
    await approveNextScale(u.id, { force: true });
    expect(await unlocked(u.id, 1)).toBe(true);
  });
});
