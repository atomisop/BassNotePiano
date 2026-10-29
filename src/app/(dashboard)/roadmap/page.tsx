import RoadmapView from "./RoadmapView";

export const metadata = { title: "Roadmap" };

/** The course: the roadmaps in order, the next step, today's cards and the chosen roadmap's scales. Home (/dashboard) is the welcome screen. */
export default async function RoadmapPage(props: { searchParams: Promise<{ roadmap?: string }> }) {
  // Not "?r=": that letter is the emailed-link owner tag the middleware checks (tagAppLinks).
  const { roadmap } = await props.searchParams;
  return <RoadmapView roadmapSlug={typeof roadmap === "string" ? roadmap.slice(0, 60) : undefined} />;
}
