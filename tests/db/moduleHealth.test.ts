import { describe, expect, it } from "vitest";
import { getModuleHealth } from "@/lib/admin";
import { prisma } from "./helpers";

describe("getModuleHealth (grouped counts)", () => {
  it("matches counting each scale on its own", async () => {
    const rows = await getModuleHealth();
    const groups = await prisma.scaleGroup.findMany({ orderBy: { order: "asc" } });
    expect(rows.map((r) => r.slug)).toEqual(groups.map((g) => g.slug));
    for (const g of groups) {
      const row = rows.find((r) => r.slug === g.slug)!;
      expect(row.unlockedCount).toBe(await prisma.scaleProgress.count({ where: { scaleGroupId: g.id, unlockedAt: { not: null } } }));
      expect(row.completedCount).toBe(await prisma.scaleProgress.count({ where: { scaleGroupId: g.id, status: "COMPLETED" } }));
    }
  });
});
