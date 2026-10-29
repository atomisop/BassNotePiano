import RoadmapView from "../roadmap/RoadmapView";

export const metadata = { title: "Home" };

/** Home. Until the new welcome Home is built (Part 2 of docs/superpowers/specs/2026-10-29-new-home-and-roadmaps-design.md) it shows the roadmap. */
export default function HomePage() {
  return <RoadmapView />;
}
