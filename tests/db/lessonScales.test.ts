import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getServerAuthSession: async () => null, authOptions: {} }));
import { addScale, createRoadmap, listScalesForLessons } from "@/lib/roadmaps";
import { createLesson, getLessonsForScale } from "@/lib/courseContent";
import { pickLessonScale } from "@/lib/lessonScales";
import { makeUser, newTag, prisma } from "./helpers";

const tag = newTag("ls");
let roadmapId = "";
let scaleId = "";
const userIds: string[] = [];

afterAll(async () => {
  if (scaleId) await prisma.lesson.deleteMany({ where: { scaleGroupId: scaleId } });
  if (scaleId) await prisma.scaleGroup.deleteMany({ where: { id: scaleId } });
  if (roadmapId) await prisma.roadmap.deleteMany({ where: { id: roadmapId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("lessons for a scale added on Roadmaps", () => {
  it("appears in the Lessons picker at once and takes lessons the student player reads", async () => {
    const roadmap = await createRoadmap({ name: `Lessons ${tag}`, description: null, instrument: null, level: null, artwork: "ocean" });
    roadmapId = roadmap.id;
    const scale = await addScale(roadmap.id, { code: "Scale 1", title: `New scale ${tag}`, formula: "1-2-3", description: null });
    scaleId = scale.id;

    const scales = await listScalesForLessons();
    const listed = scales.find((s) => s.slug === scale.slug);
    expect(listed).toMatchObject({ roadmapName: roadmap.name, roadmapHidden: true });
    // In course order, so the new scale sits after the first roadmap's.
    expect(scales[scales.length - 1].slug).toBe(scale.slug);
    expect(pickLessonScale(scales, scale.slug)?.slug).toBe(scale.slug);

    const admin = await makeUser(tag, "Lesson Admin", { role: "ADMIN" });
    userIds.push(admin.id);
    await createLesson({ scaleGroupSlug: scale.slug, title: "Lesson one", type: "PDF", fileUrl: `private:lessons/${scale.slug}/x.pdf`, fileName: "x.pdf", uploadedById: admin.id });
    expect((await getLessonsForScale(scale.slug)).map((l) => l.title)).toEqual(["Lesson one"]);
  });
});
