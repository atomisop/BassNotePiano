"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BadgeCode } from "@prisma/client";
import type { ScaleAccessState } from "@/lib/access";
import { ScaleViewToggle, SCALE_VIEW_STORAGE_KEY, type ScaleView } from "@/components/progression/ScaleViewToggle";
import { ScaleCardGrid } from "@/components/progression/ScaleCardGrid";
import { ScaleListRows } from "@/components/progression/ScaleListRows";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";

type HomeTab = "progress" | "completed" | "badges";

export interface ScaleRoadmapProps {
  roadmap: ScaleAccessState[];
  earnedBadgeCodes: BadgeCode[];
}

/**
 * Home's learning area: one set of tabs keeps the path, finished scales,
 * and badges on the same screen instead of three stacked sections (STEP
 * 2B). The tabs only filter what the dashboard already loads; no new data.
 */
export function ScaleRoadmap({ roadmap, earnedBadgeCodes }: ScaleRoadmapProps) {
  const router = useRouter();
  const [tab, setTab] = useState<HomeTab>("progress");

  // Defaults to grid on first paint (server and client agree, no hydration
  // mismatch), then swaps to whatever the student last picked once mounted.
  const [view, setView] = useState<ScaleView>("grid");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SCALE_VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      // Private browsing / blocked storage — just keep the default.
    }
  }, []);

  function handleViewChange(next: ScaleView) {
    setView(next);
    try {
      localStorage.setItem(SCALE_VIEW_STORAGE_KEY, next);
    } catch {
      // Nothing to persist to — the toggle still works for this visit.
    }
  }

  // "Current" is the same scale the dashboard's next-step card points at: the
  // first reachable, unfinished one. Exactly one card may carry the emphasised
  // treatment — that is what stops fifteen cards reading as fifteen equal demands.
  const current = roadmap.find((s) => s.canAccess && s.status !== "COMPLETED");
  const currentSlug = current?.scaleGroup.slug ?? null;

  const inProgress = roadmap.filter((s) => s.status !== "COMPLETED");
  const completed = roadmap.filter((s) => s.status === "COMPLETED");
  const shown = tab === "completed" ? completed : inProgress;

  function handleCardClick(scale: ScaleAccessState) {
    // A locked scale opens a page that says why it is locked and what to do about it.
    router.push(`/scales/${scale.scaleGroup.slug}`);
  }

  return (
    <section aria-label="Your learning">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<HomeTab>
          label="Your learning"
          value={tab}
          onChange={setTab}
          items={[
            { id: "progress", label: "In progress", count: inProgress.length },
            { id: "completed", label: "Completed", count: completed.length },
            { id: "badges", label: "Badges", count: earnedBadgeCodes.length },
          ]}
        />
        {tab !== "badges" && shown.length > 0 && <ScaleViewToggle value={view} onChange={handleViewChange} />}
      </div>

      <div className="mt-(--space-group)">
        {tab === "badges" ? (
          <BadgeGrid earnedCodes={new Set(earnedBadgeCodes)} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={tab === "completed" ? "No finished scales yet" : "Every scale is finished"}
          />
        ) : view === "grid" ? (
          <ScaleCardGrid roadmap={shown} currentSlug={currentSlug} onCardClick={handleCardClick} />
        ) : (
          <ScaleListRows roadmap={shown} currentSlug={currentSlug} onRowClick={handleCardClick} />
        )}
      </div>
    </section>
  );
}
