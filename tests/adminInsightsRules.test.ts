import { describe, expect, it } from "vitest";
import { buildInsights, type InsightInputs } from "@/lib/adminInsightsRules";

const quiet: InsightInputs = {
  scales: [],
  lessons: [],
  practice: { learners: 0, practicedThisWeek: 0, practicedLastWeek: 0 },
  classes: { held: 0, present: 0, noShow: 0, unmarked: 0, canceledByStudent: 0 },
  atom: { up: 0, down: 0, handoffs: 0 },
  trials: { started: 0, startedPlan: 0 },
  plans: { active: 0, overdue: 0 },
};

const scale = (over: Partial<InsightInputs["scales"][number]>) => ({
  code: "Scale 2",
  title: "Natural Minor",
  href: "/admin/data?tab=scales",
  unlocked: 0,
  completed: 0,
  stalled: 0,
  quizTakers: 0,
  quizFirstTryPassed: 0,
  ...over,
});

describe("buildInsights", () => {
  it("says nothing when there is too little data", () => {
    expect(buildInsights(quiet)).toEqual([]);
    expect(buildInsights({ ...quiet, scales: [scale({ unlocked: 2, stalled: 2 })] })).toEqual([]);
  });

  it("names the scale with the largest share of stalled students", () => {
    const found = buildInsights({ ...quiet, scales: [scale({ code: "Scale 1", unlocked: 10, stalled: 2 }), scale({ code: "Scale 3", unlocked: 5, stalled: 4 })] });
    expect(found.map((f) => f.id)).toEqual(["stall:Scale 3"]);
    expect(found[0].tone).toBe("fix");
    expect(found[0].evidence).toContain("4 people of 5 (80%)");
  });

  it("flags a quiz most people fail the first time", () => {
    const found = buildInsights({ ...quiet, scales: [scale({ quizTakers: 6, quizFirstTryPassed: 1 })] });
    expect(found[0].id).toBe("quiz:Scale 2");
    expect(found[0].tone).toBe("fix");
  });

  it("compares practice with last week", () => {
    const drop = buildInsights({ ...quiet, practice: { learners: 10, practicedThisWeek: 3, practicedLastWeek: 8 } });
    expect(drop[0].id).toBe("practice:drop");
    const good = buildInsights({ ...quiet, practice: { learners: 4, practicedThisWeek: 4, practicedLastWeek: 4 } });
    expect(good[0]).toMatchObject({ id: "practice:good", tone: "good" });
  });

  it("puts things to fix before things to watch before good news", () => {
    const found = buildInsights({
      ...quiet,
      practice: { learners: 4, practicedThisWeek: 4, practicedLastWeek: 4 },
      plans: { active: 10, overdue: 2 },
      trials: { started: 10, startedPlan: 1 },
    });
    expect(found.map((f) => f.tone)).toEqual(["fix", "watch", "good"]);
  });

  it("only counts no-shows among classes that were marked", () => {
    const found = buildInsights({ ...quiet, classes: { held: 10, present: 2, noShow: 2, unmarked: 6, canceledByStudent: 0 } });
    expect(found.map((f) => f.id)).toEqual(["classes:no-show", "classes:unmarked"]);
  });
});
