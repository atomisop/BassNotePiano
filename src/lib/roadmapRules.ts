/**
 * Pure rules for roadmaps (no database). The curriculum is one ordered chain of scales (ScaleGroup.order 0..n-1); a roadmap is a
 * chapter of it. These rules say how the chain is numbered from the roadmaps' order and each scale's place inside its roadmap, and
 * how far a student is through each roadmap.
 */

/** The roadmap the migration made for every scale that existed then. A scale with no roadmap belongs to it. */
export const FIRST_ROADMAP_ID = "roadmap-scales";

/** The picture choices for a roadmap card: a sky that runs from the first color at the top to the second at the bottom. */
export const ROADMAP_ARTWORKS = {
  dusk: { label: "Dusk", from: "#e9824c", via: "#b5533a", to: "#1d1a22" },
  ocean: { label: "Ocean", from: "#4fa3d9", via: "#2f5f9e", to: "#141a2a" },
  forest: { label: "Forest", from: "#7dbb73", via: "#3f7a52", to: "#13201a" },
  plum: { label: "Plum", from: "#c477c9", via: "#7a3f8f", to: "#1c1424" },
} as const;
export type RoadmapArtwork = keyof typeof ROADMAP_ARTWORKS;

export const ROADMAP_INSTRUMENTS = ["Piano", "Guitar", "Bass"] as const;
export const ROADMAP_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

export function isRoadmapArtwork(value: string): value is RoadmapArtwork {
  return Object.prototype.hasOwnProperty.call(ROADMAP_ARTWORKS, value);
}

/** "Beginner Piano!" becomes "beginner-piano". */
export function slugifyRoadmap(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "roadmap";
}

const roadmapIdOf = (scale: { roadmapId: string | null }) => scale.roadmapId ?? FIRST_ROADMAP_ID;

/**
 * Every scale's new place in the one chain: roadmaps in their order, and inside each roadmap the scales in their current order.
 * Numbered from 0 with no gaps, so the first scale of the first roadmap is always 0 (the one a new plan opens by itself).
 */
export function planScaleOrder(
  roadmaps: { id: string; order: number }[],
  scales: { id: string; roadmapId: string | null; order: number }[],
): Map<string, number> {
  const rank = new Map([...roadmaps].sort((a, b) => a.order - b.order).map((r, i) => [r.id, i]));
  const sorted = [...scales].sort(
    (a, b) => (rank.get(roadmapIdOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(roadmapIdOf(b)) ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
  );
  return new Map(sorted.map((s, i) => [s.id, i]));
}

export interface RoadmapSummary {
  total: number;
  completed: number;
  percent: number;
  /** At least one of its scales can be opened now. */
  open: boolean;
  /** Every scale in it is finished. */
  done: boolean;
}

/** How far a student is through each roadmap, and which one they are on now. */
export function summarizeRoadmaps(
  roadmaps: { id: string; order: number }[],
  scales: { roadmapId: string | null; status: string; canAccess: boolean }[],
): { byId: Map<string, RoadmapSummary>; currentId: string | null } {
  const ordered = [...roadmaps].sort((a, b) => a.order - b.order);
  const byId = new Map<string, RoadmapSummary>();
  for (const r of ordered) {
    const mine = scales.filter((s) => roadmapIdOf(s) === r.id);
    const completed = mine.filter((s) => s.status === "COMPLETED").length;
    byId.set(r.id, {
      total: mine.length,
      completed,
      percent: mine.length === 0 ? 0 : Math.round((completed / mine.length) * 100),
      open: mine.some((s) => s.canAccess),
      done: mine.length > 0 && completed === mine.length,
    });
  }
  const openOnes = ordered.filter((r) => byId.get(r.id)?.open);
  const current = openOnes.find((r) => !byId.get(r.id)?.done) ?? openOnes.at(-1) ?? ordered[0] ?? null;
  return { byId, currentId: current?.id ?? null };
}
