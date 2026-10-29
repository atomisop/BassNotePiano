import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { getRoadmap } from "@/lib/access";
import { getNextApproval, loadApprovalStates } from "@/lib/scaleApproval";
import { addScale, createRoadmap, moveRoadmap, moveScale, updateRoadmap } from "@/lib/roadmaps";
import { FIRST_ROADMAP_ID } from "@/lib/roadmapRules";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("rm");
const userIds: string[] = [];
let roadmapId = "";
const scaleIds: string[] = [];

async function orders() {
  return (await prisma.scaleGroup.findMany({ orderBy: { order: "asc" }, select: { order: true } })).map((s) => s.order);
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.scaleProgress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.scaleGroup.deleteMany({ where: { id: { in: scaleIds } } });
  if (roadmapId) {
    // Put the first roadmap back on top before removing the test one.
    const first = await prisma.roadmap.findUnique({ where: { id: FIRST_ROADMAP_ID } });
    if (first && first.order !== 0) await moveRoadmap(FIRST_ROADMAP_ID, "up");
    await prisma.roadmap.delete({ where: { id: roadmapId } });
  }
});

describe("roadmaps", () => {
  it("a new roadmap starts hidden, last, and its scales stay out of a student's view and the approval chain", async () => {
    const r = await createRoadmap({ name: `Test ${tag}`, description: null, instrument: "Piano", level: "Beginner", artwork: "ocean" });
    roadmapId = r.id;
    expect(r.visible).toBe(false);
    const s = await addScale(r.id, { code: "Test 1", title: `Test scale ${tag}`, formula: "1-2-3", description: null });
    scaleIds.push(s.id);

    const all = await orders();
    expect(all).toEqual(all.map((_, i) => i)); // one chain, 0..n-1, no gaps
    expect((await prisma.scaleGroup.findUniqueOrThrow({ where: { id: s.id } })).order).toBe(all.length - 1);

    const u = await makeUser(`${tag}a`, "Roadmap Student", { hasCurriculumAccess: true });
    userIds.push(u.id);
    expect((await getRoadmap(u.id)).some((x) => x.scaleGroup.id === s.id)).toBe(false);
    expect((await loadApprovalStates(u.id)).some((x) => x.slug === s.slug)).toBe(false);
  });

  it("once visible, the next roadmap opens through the normal approval after the last scale of the one before", async () => {
    const r = await prisma.roadmap.findUniqueOrThrow({ where: { id: roadmapId } });
    await updateRoadmap(r.id, { name: r.name, description: null, instrument: r.instrument, level: r.level, artwork: "ocean", visible: true });
    const u = await makeUser(`${tag}b`, "Roadmap Finisher", { hasCurriculumAccess: true });
    userIds.push(u.id);

    const firstRoadmapScales = await prisma.scaleGroup.findMany({ where: { NOT: { id: { in: scaleIds } } }, select: { id: true } });
    const longAgo = new Date(Date.now() - 30 * 86_400_000);
    await prisma.scaleProgress.createMany({
      data: firstRoadmapScales.map((sg) => ({ userId: u.id, scaleGroupId: sg.id, status: "COMPLETED" as const, unlockedAt: longAgo, completedAt: longAgo })),
    });

    const view = await getRoadmap(u.id);
    const newScale = view.find((x) => x.scaleGroup.id === scaleIds[0]);
    expect(newScale?.canAccess).toBe(false); // not approved yet
    const next = await getNextApproval(u.id);
    expect(next).toMatchObject({ state: "READY", nextSlug: newScale?.scaleGroup.slug });
  });

  it("moving a roadmap renumbers the whole chain, and moving a scale stays inside its roadmap", async () => {
    await moveRoadmap(roadmapId, "up");
    expect((await prisma.scaleGroup.findUniqueOrThrow({ where: { id: scaleIds[0] } })).order).toBe(0);
    const all = await orders();
    expect(all).toEqual(all.map((_, i) => i));

    // The only scale in its roadmap: moving it does nothing.
    await moveScale(scaleIds[0], "down");
    expect((await prisma.scaleGroup.findUniqueOrThrow({ where: { id: scaleIds[0] } })).order).toBe(0);

    await moveRoadmap(roadmapId, "down");
    expect((await prisma.scaleGroup.findFirstOrThrow({ where: { order: 0 } })).id).not.toBe(scaleIds[0]);
  });
});
