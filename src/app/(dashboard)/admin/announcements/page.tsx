import { listAnnouncements } from "@/lib/announcements";
import { getOverviewStats } from "@/lib/admin";
import { AnnouncementManager } from "@/components/admin/AnnouncementManager";

export default async function AdminAnnouncementsPage() {
  const [announcements, stats] = await Promise.all([listAnnouncements(), getOverviewStats()]);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Announcements</h1>

      <div className="mt-8">
        <AnnouncementManager initialAnnouncements={announcements} totalUsers={stats.totalUsers} />
      </div>
    </div>
  );
}
