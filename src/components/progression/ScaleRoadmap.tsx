"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScaleAccessState } from "@/lib/access";
import { ScaleViewToggle, SCALE_VIEW_STORAGE_KEY, type ScaleView } from "@/components/progression/ScaleViewToggle";
import { ScaleCardGrid } from "@/components/progression/ScaleCardGrid";
import { ScaleListRows } from "@/components/progression/ScaleListRows";

export interface ScaleRoadmapProps {
  roadmap: ScaleAccessState[];
}

export function ScaleRoadmap({ roadmap }: ScaleRoadmapProps) {
  const router = useRouter();

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
  const currentIndex = roadmap.findIndex((s) => s.canAccess && s.status !== "COMPLETED");

  function handleCardClick(scale: ScaleAccessState) {
    if (scale.canAccess) {
      router.push(`/scales/${scale.scaleGroup.slug}`);
      return;
    }
    // Locked for a paying student means "your teacher hasn't released this
    // yet": nothing to buy, so the click does nothing. Locked with no plan
    // is the one case where the way forward is a class plan.
    if (scale.lockedBecause === "no-plan") router.push("/billing/plans");
  }

  return (
    <>
      <div className="mx-auto flex max-w-5xl items-center justify-end pb-4">
        <ScaleViewToggle value={view} onChange={handleViewChange} />
      </div>

      <div className="mx-auto max-w-5xl">
        {view === "grid" ? (
          <ScaleCardGrid roadmap={roadmap} currentIndex={currentIndex} onCardClick={handleCardClick} />
        ) : (
          <ScaleListRows roadmap={roadmap} currentIndex={currentIndex} onRowClick={handleCardClick} />
        )}
      </div>

    </>
  );
}
