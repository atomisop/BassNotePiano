import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { listRoadmapsForAdmin } from "@/lib/roadmaps";
import { RoadmapsAdmin } from "@/components/admin/RoadmapsAdmin";
import { PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Admin: Roadmaps" };

/** Admin > Setup > Roadmaps: the owner adds roadmaps, orders them, adds scales and decides when students see each one. */
export default async function AdminRoadmapsPage() {
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Roadmaps</h1>
        <p className="mt-2 text-small text-slate-500">Only the owner can change the roadmaps.</p>
      </div>
    );
  }
  const roadmaps = await listRoadmapsForAdmin();
  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/admin" />
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Roadmaps</h1>
      </div>
      <p className="mt-2 max-w-2xl text-small text-slate-500">
        Students go through the roadmaps in this order. Each one opens after they finish the one before, through the same scale approvals you
        already give. A new roadmap starts hidden: add its scales (and their lessons under Classes &gt; Lessons), then turn it on.
      </p>
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
