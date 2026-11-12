import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { listRoadmapsForAdmin } from "@/lib/roadmaps";
import { RoadmapsAdmin } from "@/components/admin/RoadmapsAdmin";


/** Admin > Setup > Roadmaps: the owner adds roadmaps, orders them, adds scales and decides when students see each one. */
export async function RoadmapsView() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 data-page-title="" className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Roadmaps</h1>
        <p className="mt-3 text-small text-slate-400">Only the owner can change the roadmaps.</p>
      </div>
    );
  }
  const roadmaps = await listRoadmapsForAdmin();
  return (
    <div>
      <h1 className="sr-only">Roadmaps</h1>
      <p className="mt-2 max-w-2xl text-small text-slate-500">Students go through the roadmaps in this order. Each one opens after they finish the one before, through the same scale approvals you already give. A new roadmap starts hidden: add its scales, tap a scale&apos;s lesson count to add its lessons, then turn it on.</p>
      <div className="mt-6">
        <RoadmapsAdmin
          roadmaps={roadmaps.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            instrument: r.instrument,
            level: r.level,
            artwork: r.artwork,
            visible: r.visible,
            scales: r.scales,
          }))}
        />
      </div>
    </div>
  );
}
