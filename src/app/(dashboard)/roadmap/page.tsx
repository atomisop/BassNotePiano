import RoadmapView from "./RoadmapView";

export const metadata = { title: "Roadmap" };

/** The course: the next step, today's cards and every scale in order. One of the roadmaps; Home (/dashboard) is the welcome screen. */
export default function RoadmapPage() {
  return <RoadmapView />;
}
