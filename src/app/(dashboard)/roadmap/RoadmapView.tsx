import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { SCALE_VIEW_COOKIE, parseScaleView } from "@/lib/scaleView";
import { roadmapsForViewer } from "@/lib/roadmaps";
import { FIRST_ROADMAP_ID, summarizeRoadmaps } from "@/lib/roadmapRules";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";
import { Eyebrow } from "@/components/ui/Card";
import { WideLayout } from "@/components/layout/PageLayouts";
import { RoadmapPicker } from "@/components/home/RoadmapPicker";

/**
 * The Roadmap screen: the course itself and nothing else. A plain header (the roadmap's name), the strip of
 * roadmaps when there is more than one, and the chosen roadmap's scales. The greeting and the day's cards (next step, practice, next
 * class, progress, getting started, teacher notes) live on Home.
 */
export default async function RoadmapView({ roadmapSlug }: { roadmapSlug?: string } = {}) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/roadmap");

  const [allScales, roadmapList, badgeRows] = await Promise.all([
    getRoadmap(session.user.id),
    roadmapsForViewer(session.user.role === "ADMIN"),
    prisma.userBadge.findMany({ where: { userId: session.user.id }, select: { code: true } }),
  ]);

  // The roadmap on screen: the one asked for (?roadmap=slug), else the one the student is on now.
  const { byId: roadmapSummaries, currentId } = summarizeRoadmaps(
    roadmapList,
    allScales.map((s) => ({ roadmapId: s.scaleGroup.roadmapId, status: s.status, canAccess: s.canAccess })),
  );
  const selected = roadmapList.find((r) => r.slug === roadmapSlug) ?? roadmapList.find((r) => r.id === currentId) ?? roadmapList[0] ?? null;
  const roadmap = selected ? allScales.filter((s) => (s.scaleGroup.roadmapId ?? FIRST_ROADMAP_ID) === selected.id) : allScales;
  const selectedIndex = selected ? roadmapList.indexOf(selected) : -1;
  const selectedLocked = selected ? !roadmapSummaries.get(selected.id)?.open : false;

  return (
    <WideLayout>
      <div className="grid grid-cols-1 gap-y-(--space-group)">
        <div data-deck-header className="deck-header pt-4 md:pt-6">
          <Eyebrow>Roadmap</Eyebrow>
          <h1 className="mt-1 text-hero font-semibold text-slate-50">{selected?.name ?? "Scales"}</h1>
        </div>

        {roadmapList.length > 1 && selected && (
          <div className="grid gap-2">
            <RoadmapPicker
              selectedId={selected.id}
              roadmaps={roadmapList.map((r) => ({ id: r.id, slug: r.slug, name: r.name, artwork: r.artwork, visible: r.visible, summary: roadmapSummaries.get(r.id)! }))}
            />
            {selectedLocked && selectedIndex > 0 && (
              <p className="text-small text-slate-400">
                {roadmap.length === 0
                  ? "The scales for this roadmap are coming soon."
                  : `This roadmap opens after you finish ${roadmapList[selectedIndex - 1].name}. Your teacher opens its first scale then.`}
              </p>
            )}
          </div>
        )}

        <div>
          <h2 className="sr-only">Your scales</h2>
          <ScaleRoadmap
            roadmap={roadmap}
            earnedBadgeCodes={badgeRows.map((b) => b.code)}
            artBase={process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/scale-art` : null}
            initialView={parseScaleView((await cookies()).get(SCALE_VIEW_COOKIE)?.value) ?? "grid"}
          />
        </div>
      </div>
    </WideLayout>
  );
}
