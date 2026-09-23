"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ScaleAccessState } from "@/lib/access";
import { ProOverrideConfirmModal } from "@/components/progression/ProOverrideConfirmModal";
import { ScaleViewToggle, SCALE_VIEW_STORAGE_KEY, type ScaleView } from "@/components/progression/ScaleViewToggle";
import { ScaleCardGrid } from "@/components/progression/ScaleCardGrid";
import { ScaleListRows } from "@/components/progression/ScaleListRows";

export interface ScaleRoadmapProps {
  roadmap: ScaleAccessState[];
}

export function ScaleRoadmap({ roadmap }: ScaleRoadmapProps) {
  const router = useRouter();
  const { update } = useSession();
  const [pendingOverride, setPendingOverride] = useState<ScaleAccessState | null>(null);
  const [confirming, setConfirming] = useState(false);

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
    if (scale.requiresOverrideConfirm) {
      setPendingOverride(scale);
      return;
    }
    if (scale.canAccess) {
      router.push(`/scales/${scale.scaleGroup.slug}`);
      return;
    }
    // Not accessible at all — the only way forward is buying the full
    // curriculum, regardless of which scale was clicked (per-scale purchase
    // no longer exists), so every locked card is a soft ad for /billing/curriculum.
    router.push("/billing/curriculum");
  }

  async function handleConfirmOverride() {
    if (!pendingOverride) return;
    setConfirming(true);
    // Middleware gates /scales/[slug] off the JWT, not the DB — and that
    // token can still say hasCurriculumAccess: false if it was minted before
    // curriculum access was granted. Without this refresh, the ?override=confirmed
    // request middleware sees is built on stale claims, so it bounces the
    // navigation straight back here — looking like "Confirm" did nothing.
    await update();
    router.push(`/scales/${pendingOverride.scaleGroup.slug}?override=confirmed`);
    setConfirming(false);
    setPendingOverride(null);
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

      <ProOverrideConfirmModal
        isOpen={pendingOverride !== null}
        targetCode={pendingOverride?.scaleGroup.code ?? ""}
        isConfirming={confirming}
        onConfirm={handleConfirmOverride}
        onCancel={() => setPendingOverride(null)}
      />
    </>
  );
}
