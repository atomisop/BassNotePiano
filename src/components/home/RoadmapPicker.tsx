import Link from "next/link";
import { Check, Lock } from "@/components/ui/appIcons";
import { RoadmapArtwork } from "@/components/home/RoadmapArtwork";
import type { RoadmapSummary } from "@/lib/roadmapRules";
import { cn } from "@/lib/utils";

export interface PickerRoadmap {
  id: string;
  slug: string;
  name: string;
  artwork: string;
  visible: boolean;
  summary: RoadmapSummary;
}

/**
 * The roadmaps in order, as a row of cards above the scales (it scrolls sideways on a phone). Each says how far you are, that you
 * finished it, or that it is still locked. The one on screen is ringed.
 */
export function RoadmapPicker({ roadmaps, selectedId }: { roadmaps: PickerRoadmap[]; selectedId: string }) {
  return (
    <nav aria-label="Your roadmaps" className="shelf -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
      <ol className="flex gap-2.5">
        {roadmaps.map((r) => {
          const selected = r.id === selectedId;
          const s = r.summary;
          return (
            <li key={r.id} className="shrink-0 snap-start">
              <Link
                href={`/roadmap?roadmap=${encodeURIComponent(r.slug)}`}
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "tap flex w-52 items-center gap-3 rounded-card bg-neu-base p-2.5 shadow-raised-mid transition",
                  selected ? "ring-2 ring-signal" : "hover:brightness-110",
                )}
              >
                <RoadmapArtwork artwork={r.artwork} className={cn("h-12 w-12 shrink-0", !s.open && "opacity-50")} />
                <span className="min-w-0">
                  <span className="block truncate text-small font-semibold text-slate-50">{r.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-caption text-slate-400">
                    {s.done ? (
                      <>
                        <Check aria-hidden className="h-3.5 w-3.5" /> Finished
                      </>
                    ) : s.open ? (
                      `${s.completed} of ${s.total} scales`
                    ) : (
                      <>
                        <Lock aria-hidden className="h-3.5 w-3.5" /> {s.total === 0 ? "Coming soon" : "Locked"}
                      </>
                    )}
                    {!r.visible && <span className="ml-1 text-slate-500">(hidden)</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
