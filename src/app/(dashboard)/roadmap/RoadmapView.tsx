import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { SCALE_VIEW_COOKIE, parseScaleView } from "@/lib/scaleView";
import { roadmapsForViewer } from "@/lib/roadmaps";
import { FIRST_ROADMAP_ID, summarizeRoadmaps } from "@/lib/roadmapRules";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";
import { Eyebrow } from "@/components/ui/Card";
import { WideLayout } from "@/components/layout/PageLayouts";
import { RoadmapPicker } from "@/components/home/RoadmapPicker";
import { HeroBand } from "@/components/ui/HeroBand";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight } from "@/components/ui/appIcons";
import { ctaLabel } from "@/lib/ctaLabel";

/**
 * The Roadmap screen: the course itself and nothing else. A plain header (the roadmap's name), the band carrying the scale you are
 * on with its button on the sheet, the strip of roadmaps when there is more than one, and the chosen roadmap's scales. The greeting and the day's cards (next step, practice, next
 * class, progress, getting started, teacher notes) live on Home.
 */
export default async function RoadmapView({ roadmapSlug }: { roadmapSlug?: string } = {}) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/roadmap");

  const [allScales, roadmapList] = await Promise.all([getRoadmap(session.user.id), roadmapsForViewer(session.user.role === "ADMIN")]);

  // The roadmap on screen: the one asked for (?roadmap=slug), else the one the student is on now.
  const { byId: roadmapSummaries, currentId } = summarizeRoadmaps(
    roadmapList,
    allScales.map((s) => ({ roadmapId: s.scaleGroup.roadmapId, status: s.status, canAccess: s.canAccess })),
  );
  const selected = roadmapList.find((r) => r.slug === roadmapSlug) ?? roadmapList.find((r) => r.id === currentId) ?? roadmapList[0] ?? null;
  const roadmap = selected ? allScales.filter((s) => (s.scaleGroup.roadmapId ?? FIRST_ROADMAP_ID) === selected.id) : allScales;
  const selectedIndex = selected ? roadmapList.indexOf(selected) : -1;
  const selectedLocked = selected ? !roadmapSummaries.get(selected.id)?.open : false;

  // The one fact of this screen: the scale you are on (the same one the scale cards light up), and how far along the roadmap you are.
  const doneCount = roadmap.filter((s) => s.status === "COMPLETED").length;
  const current = roadmap.find((s) => s.canAccess && s.status !== "COMPLETED") ?? null;
  const upNext = current ?? roadmap.find((s) => s.status !== "COMPLETED") ?? null;
  const percent = roadmap.length > 0 ? Math.round((doneCount / roadmap.length) * 100) : 0;
  const doneLine = `${doneCount} of ${roadmap.length} scales done`;
  const waitsForPrevious = selectedLocked && selectedIndex > 0;

  return (
    <WideLayout>
      <div className="grid grid-cols-1 gap-y-(--space-group)">
        <div data-deck-header className="deck-header pt-4 md:pt-6">
          <Eyebrow>Roadmap</Eyebrow>
          <h1 className="mt-1 text-hero font-semibold text-slate-50">{selected?.name ?? "Scales"}</h1>
        </div>

        {roadmap.length === 0 ? (
          <HeroBand eyebrow="Coming soon" title="The scales for this roadmap are coming soon." artwork={selected?.artwork} />
        ) : waitsForPrevious && !current ? (
          <HeroBand
            eyebrow="Locked for now"
            title={`Opens after you finish ${roadmapList[selectedIndex - 1].name}`}
            meta="Your teacher opens its first scale then."
            artwork={selected?.artwork}
          />
        ) : upNext ? (
          <HeroBand
            eyebrow={current ? "You are here" : "Up next"}
            title={`${upNext.scaleGroup.code} · ${upNext.scaleGroup.title}`}
            meta={doneLine}
            artwork={selected?.artwork}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-3">
              <div className="min-w-40 flex-1">
                <div className="flex items-center justify-between text-small text-slate-500">
                  <span>{selected?.name ?? "Roadmap"}</span>
                  <span className="font-medium tabular-nums text-slate-300">{percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-50/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Roadmap progress">
                  <div className="h-full rounded-full bg-signal" style={{ width: `${percent}%` }} />
                </div>
              </div>
              {/* The same words and the same page as this scale's own card below. */}
              <Link href={`/scales/${upNext.scaleGroup.slug}`} className={buttonVariants({ variant: current ? "primary" : "secondary", className: "w-full sm:w-auto" })}>
                {ctaLabel(upNext)}
                {current && <ArrowRight aria-hidden className="h-4 w-4" />}
              </Link>
            </div>
          </HeroBand>
        ) : (
          <HeroBand eyebrow="All done" title="Every scale is finished" meta={doneLine} artwork={selected?.artwork} />
        )}

        {roadmapList.length > 1 && selected && (
          <RoadmapPicker
            selectedId={selected.id}
            roadmaps={roadmapList.map((r) => ({ id: r.id, slug: r.slug, name: r.name, artwork: r.artwork, visible: r.visible, summary: roadmapSummaries.get(r.id)! }))}
          />
        )}

        <div>
          <h2 className="sr-only">Your scales</h2>
          <ScaleRoadmap
            roadmap={roadmap}
            artBase={process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/scale-art` : null}
            initialView={parseScaleView((await cookies()).get(SCALE_VIEW_COOKIE)?.value) ?? "grid"}
          />
        </div>
      </div>
    </WideLayout>
  );
}
