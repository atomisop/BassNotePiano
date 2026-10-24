"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BadgeCode } from "@prisma/client";
import type { ScaleAccessState } from "@/lib/access";
import { ScaleViewToggle, SCALE_VIEW_STORAGE_KEY, type ScaleView } from "@/components/progression/ScaleViewToggle";
import { ScaleCardGrid } from "@/components/progression/ScaleCardGrid";
import { ScaleListRows } from "@/components/progression/ScaleListRows";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { scaleViewCookie } from "@/lib/scaleView";

// useLayoutEffect warns during server rendering; the position fix only matters in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type HomeTab = "progress" | "completed" | "badges";

export interface ScaleRoadmapProps {
  roadmap: ScaleAccessState[];
  earnedBadgeCodes: BadgeCode[];
  /** The layout they last chose, read from the cookie on the server so the first paint is already right. */
  initialView?: ScaleView;
}

/**
 * Home's learning area: one set of tabs keeps the path, finished scales,
 * and badges on the same screen instead of three stacked sections (STEP
 * 2B). The tabs only filter what the dashboard already loads; no new data.
 */
/** Scales shown at first on a phone. */
const PHONE_VISIBLE = 4;

export function ScaleRoadmap({ roadmap, earnedBadgeCodes, initialView = "grid" }: ScaleRoadmapProps) {
  const router = useRouter();
  const [tab, setTab] = useState<HomeTab>("progress");
  // Phones: the path is fifteen cards long. Show the scale you are on and the next few; the rest open on request.
  const [showAllOnPhone, setShowAllOnPhone] = useState(false);

  const [view, setView] = useState<ScaleView>(initialView);
  const sectionRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLDivElement>(null);
  // Where the switch sat on screen when it was tapped, so the page can be put back so it is still under the finger.
  const anchorTop = useRef<number | null>(null);

  // People who chose List before the cookie existed: carry that choice over once.
  useEffect(() => {
    try {
      const old = localStorage.getItem(SCALE_VIEW_STORAGE_KEY);
      if ((old === "grid" || old === "list") && old !== view && !document.cookie.includes("bnp-scales-view=")) {
        setView(old);
        document.cookie = scaleViewCookie(old);
      }
    } catch {
      // Private browsing / blocked storage: keep what the server sent.
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleViewChange(next: ScaleView) {
    if (next === view) return;
    const section = sectionRef.current;
    const toggle = toggleRef.current;
    if (section && toggle) {
      anchorTop.current = toggle.getBoundingClientRect().top;
      // The list is far shorter than the grid. Without this the page would shrink under the finger and the switch would slide away.
      section.style.minHeight = `${section.offsetHeight}px`;
    }
    setView(next);
    document.cookie = scaleViewCookie(next);
  }

  // After the new layout is in, scroll so the switch is exactly where it was, then let the page shrink on the next scroll.
  useIsoLayoutEffect(() => {
    const top = anchorTop.current;
    const toggle = toggleRef.current;
    const main = document.getElementById("app-scroll");
    if (top === null || !toggle || !main) return;
    anchorTop.current = null;
    const delta = toggle.getBoundingClientRect().top - top;
    if (Math.abs(delta) > 0.5) main.scrollTop += delta;
    const release = () => {
      if (sectionRef.current) sectionRef.current.style.minHeight = "";
    };
    main.addEventListener("scroll", release, { once: true, passive: true });
    const timer = window.setTimeout(() => main.removeEventListener("scroll", release), 60_000);
    return () => window.clearTimeout(timer);
  }, [view]);

  // "Current" is the same scale the dashboard's next-step card points at: the
  // first reachable, unfinished one. Exactly one card may carry the emphasised
  // treatment, that is what stops fifteen cards reading as fifteen equal demands.
  const current = roadmap.find((s) => s.canAccess && s.status !== "COMPLETED");
  const currentSlug = current?.scaleGroup.slug ?? null;

  const inProgress = roadmap.filter((s) => s.status !== "COMPLETED");
  const completed = roadmap.filter((s) => s.status === "COMPLETED");
  const shown = tab === "completed" ? completed : inProgress;
  const hiddenOnPhone = Math.max(0, shown.length - PHONE_VISIBLE);
  const phoneHiddenFrom = showAllOnPhone || hiddenOnPhone === 0 ? undefined : PHONE_VISIBLE;

  function handleCardClick(scale: ScaleAccessState) {
    // A locked scale opens a page that says why it is locked and what to do about it.
    router.push(`/scales/${scale.scaleGroup.slug}`);
  }

  return (
    <section ref={sectionRef} aria-label="Your learning">
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
        {tab !== "badges" && shown.length > 0 && (
          <div ref={toggleRef}>
            <ScaleViewToggle value={view} onChange={handleViewChange} />
          </div>
        )}
      </div>

      <div className="mt-(--space-group)">
        {tab === "badges" ? (
          <BadgeGrid earnedCodes={new Set(earnedBadgeCodes)} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={tab === "completed" ? "No finished scales yet" : "Every scale is finished"}
          />
        ) : view === "grid" ? (
          <ScaleCardGrid roadmap={shown} currentSlug={currentSlug} onCardClick={handleCardClick} phoneHiddenFrom={phoneHiddenFrom} />
        ) : (
          <ScaleListRows roadmap={shown} currentSlug={currentSlug} onRowClick={handleCardClick} phoneHiddenFrom={phoneHiddenFrom} />
        )}
        {tab !== "badges" && hiddenOnPhone > 0 && (
          <button
            type="button"
            aria-expanded={showAllOnPhone}
            onClick={() => setShowAllOnPhone((v) => !v)}
            className="tap mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-neu-base px-4 py-2.5 text-small font-semibold text-slate-100 shadow-raised-low active:shadow-pressed-low md:hidden"
          >
            {showAllOnPhone ? "Show fewer" : `Show all ${shown.length} scales`}
          </button>
        )}
      </div>
    </section>
  );
}
