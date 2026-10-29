import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FIRST_ROADMAP_ID, planScaleOrder, slugifyRoadmap, type RoadmapArtwork } from "@/lib/roadmapRules";

/**
 * Roadmaps in the database: the owner's admin screen (create, edit, reorder, add scales) and the list students see. The curriculum
 * stays one chain of scales; every change that moves things renumbers the whole chain (renumberScales) so it is always 0..n-1 in
 * roadmap order. Nothing here deletes: a roadmap is hidden instead.
 */

export class RoadmapError extends Error {}

type Tx = Prisma.TransactionClient;

export interface RoadmapInput {
  name: string;
  description: string | null;
  instrument: string | null;
  level: string | null;
  artwork: RoadmapArtwork;
}

export interface ScaleInput {
  code: string;
  title: string;
  formula: string;
  description: string | null;
}

/** Renumber every scale from the roadmaps' order. Two steps (all negative first) so the unique order never collides mid way. */
async function renumberScales(tx: Tx) {
  const [roadmaps, scales] = await Promise.all([
    tx.roadmap.findMany({ select: { id: true, order: true } }),
    tx.scaleGroup.findMany({ select: { id: true, roadmapId: true, order: true } }),
  ]);
  const plan = planScaleOrder(roadmaps, scales);
  if (scales.every((s) => plan.get(s.id) === s.order)) return;
  await tx.$executeRaw`UPDATE "ScaleGroup" SET "order" = -"order" - 1`;
  for (const s of scales) await tx.scaleGroup.update({ where: { id: s.id }, data: { order: plan.get(s.id)! } });
}

async function uniqueRoadmapSlug(tx: Tx, name: string, exceptId?: string): Promise<string> {
  const base = slugifyRoadmap(name);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await tx.roadmap.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  throw new RoadmapError("Pick a different name.");
}

async function uniqueScaleSlug(tx: Tx, title: string): Promise<string> {
  const base = `scale-${slugifyRoadmap(title)}`.slice(0, 60);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await tx.scaleGroup.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new RoadmapError("Pick a different scale title.");
}

export async function listRoadmapsForAdmin() {
  const [roadmaps, scales] = await Promise.all([
    prisma.roadmap.findMany({ orderBy: { order: "asc" } }),
    prisma.scaleGroup.findMany({ orderBy: { order: "asc" }, select: { id: true, slug: true, code: true, title: true, roadmapId: true, _count: { select: { lessons: true } } } }),
  ]);
  return roadmaps.map((r) => ({
    ...r,
    scales: scales
      .filter((s) => (s.roadmapId ?? FIRST_ROADMAP_ID) === r.id)
      .map((s) => ({ id: s.id, slug: s.slug, code: s.code, title: s.title, lessons: s._count.lessons })),
  }));
}

/** A new roadmap goes last and starts hidden, so students only see it once it has scales and the owner turns it on. */
export async function createRoadmap(input: RoadmapInput) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.roadmap.aggregate({ _max: { order: true } });
    return tx.roadmap.create({
      data: { ...input, slug: await uniqueRoadmapSlug(tx, input.name), order: (last._max.order ?? -1) + 1, visible: false },
    });
  });
}

export async function updateRoadmap(id: string, input: RoadmapInput & { visible: boolean }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.roadmap.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new RoadmapError("That roadmap no longer exists.");
    return tx.roadmap.update({ where: { id }, data: { ...input, slug: await uniqueRoadmapSlug(tx, input.name, id) } });
  });
}

export async function moveRoadmap(id: string, direction: "up" | "down") {
  await prisma.$transaction(async (tx) => {
    const all = await tx.roadmap.findMany({ orderBy: { order: "asc" }, select: { id: true, order: true } });
    const i = all.findIndex((r) => r.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    const [a, b] = [all[i], all[j]];
    await tx.roadmap.update({ where: { id: a.id }, data: { order: -1 } });
    await tx.roadmap.update({ where: { id: b.id }, data: { order: a.order } });
    await tx.roadmap.update({ where: { id: a.id }, data: { order: b.order } });
    await renumberScales(tx);
  });
}

/** A new scale goes at the end of its roadmap; its lessons are added on Admin > Classes > Lessons as for any scale. */
export async function addScale(roadmapId: string, input: ScaleInput) {
  return prisma.$transaction(async (tx) => {
    const roadmap = await tx.roadmap.findUnique({ where: { id: roadmapId }, select: { id: true } });
    if (!roadmap) throw new RoadmapError("That roadmap no longer exists.");
    const last = await tx.scaleGroup.aggregate({ _max: { order: true } });
    const scale = await tx.scaleGroup.create({
      data: { ...input, roadmapId, slug: await uniqueScaleSlug(tx, input.title), order: (last._max.order ?? -1) + 1 },
    });
    await renumberScales(tx);
    return scale;
  });
}

/** Swap a scale with its neighbor inside the same roadmap. */
export async function moveScale(id: string, direction: "up" | "down") {
  await prisma.$transaction(async (tx) => {
    const scale = await tx.scaleGroup.findUnique({ where: { id }, select: { id: true, roadmapId: true, order: true } });
    if (!scale) throw new RoadmapError("That scale no longer exists.");
    const roadmapId = scale.roadmapId ?? FIRST_ROADMAP_ID;
    const siblings = (await tx.scaleGroup.findMany({ orderBy: { order: "asc" }, select: { id: true, roadmapId: true, order: true } })).filter(
      (s) => (s.roadmapId ?? FIRST_ROADMAP_ID) === roadmapId,
    );
    const i = siblings.findIndex((s) => s.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    const [a, b] = [siblings[i], siblings[j]];
    await tx.scaleGroup.update({ where: { id: a.id }, data: { order: -1 } });
    await tx.scaleGroup.update({ where: { id: b.id }, data: { order: a.order } });
    await tx.scaleGroup.update({ where: { id: a.id }, data: { order: b.order } });
  });
}

/** The roadmaps someone can see, in order: every one for the admin, the visible ones for students. */
export async function roadmapsForViewer(isAdmin: boolean) {
  return prisma.roadmap.findMany({ where: isAdmin ? {} : { visible: true }, orderBy: { order: "asc" } });
}

/** Ids of hidden roadmaps: their scales are left out for students and out of the teacher's approval chain. */
export async function hiddenRoadmapIds(): Promise<Set<string>> {
  return new Set((await prisma.roadmap.findMany({ where: { visible: false }, select: { id: true } })).map((r) => r.id));
}
