import { describe, expect, it } from "vitest";
import { FIRST_ROADMAP_ID, planScaleOrder, slugifyRoadmap, summarizeRoadmaps } from "@/lib/roadmapRules";

describe("slugifyRoadmap", () => {
  it("makes a short web-safe slug", () => {
    expect(slugifyRoadmap("Beginner Piano!")).toBe("beginner-piano");
    expect(slugifyRoadmap("  Worship & Church  Songs ")).toBe("worship-church-songs");
    expect(slugifyRoadmap("!!!")).toBe("roadmap");
  });
});

describe("planScaleOrder", () => {
  const roadmaps = [
    { id: FIRST_ROADMAP_ID, order: 0 },
    { id: "r2", order: 1 },
  ];
  it("numbers scales by roadmap order, then their place inside it, from 0 with no gaps", () => {
    const plan = planScaleOrder(roadmaps, [
      { id: "b1", roadmapId: "r2", order: 40 },
      { id: "a2", roadmapId: null, order: 7 },
      { id: "a1", roadmapId: FIRST_ROADMAP_ID, order: 2 },
      { id: "b2", roadmapId: "r2", order: 41 },
    ]);
    expect([...plan.entries()]).toEqual([
      ["a1", 0],
      ["a2", 1],
      ["b1", 2],
      ["b2", 3],
    ]);
  });
  it("follows the roadmaps when their order changes", () => {
    const swapped = [
      { id: FIRST_ROADMAP_ID, order: 1 },
      { id: "r2", order: 0 },
    ];
    const plan = planScaleOrder(swapped, [
      { id: "a1", roadmapId: null, order: 0 },
      { id: "b1", roadmapId: "r2", order: 1 },
    ]);
    expect(plan.get("b1")).toBe(0);
    expect(plan.get("a1")).toBe(1);
  });
});

describe("summarizeRoadmaps", () => {
  const roadmaps = [
    { id: FIRST_ROADMAP_ID, order: 0 },
    { id: "r2", order: 1 },
    { id: "r3", order: 2 },
  ];
  it("counts progress per roadmap and picks the first open one that is not done", () => {
    const { byId, currentId } = summarizeRoadmaps(roadmaps, [
      { roadmapId: null, status: "COMPLETED", canAccess: true },
      { roadmapId: null, status: "COMPLETED", canAccess: true },
      { roadmapId: "r2", status: "UNLOCKED", canAccess: true },
      { roadmapId: "r2", status: "LOCKED", canAccess: false },
      { roadmapId: "r3", status: "LOCKED", canAccess: false },
    ]);
    expect(byId.get(FIRST_ROADMAP_ID)).toMatchObject({ total: 2, completed: 2, percent: 100, open: true, done: true });
    expect(byId.get("r2")).toMatchObject({ total: 2, completed: 0, open: true, done: false });
    expect(byId.get("r3")).toMatchObject({ open: false });
    expect(currentId).toBe("r2");
  });
  it("falls back to the first roadmap when nothing is open", () => {
    const { currentId } = summarizeRoadmaps(roadmaps, [{ roadmapId: null, status: "LOCKED", canAccess: false }]);
    expect(currentId).toBe(FIRST_ROADMAP_ID);
  });
  it("an empty roadmap is neither open nor done", () => {
    const { byId } = summarizeRoadmaps(roadmaps, []);
    expect(byId.get("r3")).toMatchObject({ total: 0, open: false, done: false, percent: 0 });
  });
});
