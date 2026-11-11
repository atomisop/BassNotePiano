import Link from "next/link";
import type { ReactNode } from "react";
import { artworkColors } from "@/components/home/RoadmapArtwork";
import { RoadmapKeys } from "@/components/home/RoadmapCard";

/**
 * Home's one hero: the roadmap's picture (its sky over a row of piano keys) carrying the one thing to do today, its button, and a slim
 * line for where you are on the roadmap. Everything else on Home is a quiet row under it, so this is the only big, colored thing on the
 * page. The artwork is the same in both themes, so its text is always light.
 */
export function HomeHero({
  artwork,
  eyebrow,
  title,
  detail,
  actions,
  progress,
}: {
  artwork: string;
  eyebrow: string;
  title: string;
  detail?: string;
  actions: ReactNode;
  /** Where the student is on the roadmap; the whole line opens the Roadmap screen. */
  progress?: { name: string; current: string | null; percent: number } | null;
}) {
  const a = artworkColors(artwork);
  return (
    <section className="color-tile relative overflow-hidden rounded-sheet text-white" style={{ background: `linear-gradient(180deg, ${a.from} 0%, ${a.via} 48%, ${a.to} 100%)` }}>
      <RoadmapKeys />
      <div className="relative flex min-h-[17rem] flex-col p-6 md:min-h-[22rem] md:p-8">
        <p className="text-small font-medium text-white/80">{eyebrow}</p>
        {/* The one biggest line on Home at every width (the greeting above it is a step smaller). */}
        <h2 className="mt-2 max-w-xl text-hero font-bold leading-tight text-balance">{title}</h2>
        {detail && <p className="mt-2 line-clamp-3 max-w-xl text-body text-white/80">{detail}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3 pb-2">{actions}</div>
        {progress && (
          <Link
            href="/roadmap"
            aria-label={`Open your roadmap, ${progress.name}. ${progress.percent}% done.`}
            className="group mt-auto block pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="flex items-center justify-between gap-3 text-small text-white/75">
              <span className="min-w-0 truncate">
                <span className="font-medium text-white/90">{progress.name}</span>
                {progress.current && <> · {progress.current}</>}
              </span>
              <span className="shrink-0 tabular-nums">{progress.percent}%</span>
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${progress.percent}%` }} />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
