import { listSentAdminMessages } from "@/lib/mail";
import { listAnnouncements } from "@/lib/announcements";
import { getOverviewStats } from "@/lib/admin";
import { MessageComposer } from "@/components/admin/MessageComposer";
import { AnnouncementManager } from "@/components/admin/AnnouncementManager";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";

export default async function AdminMessagesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const announcementsTab = searchParams.tab === "announcements";

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Messages</h1>

      <div className="mt-6">
        <AdminFilterTabs
          label="Message type"
          items={[
            { label: "Direct", href: "/admin/messages", active: !announcementsTab },
            { label: "Announcements", href: "/admin/messages?tab=announcements", active: announcementsTab },
          ]}
        />
      </div>

      <div className="mt-6">{announcementsTab ? <Announcements /> : <Direct />}</div>
    </div>
  );
}

async function Direct() {
  const sent = await listSentAdminMessages();
  return <MessageComposer sent={sent.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />;
}

async function Announcements() {
  const [announcements, stats] = await Promise.all([listAnnouncements(), getOverviewStats()]);
  return <AnnouncementManager initialAnnouncements={announcements} totalUsers={stats.totalUsers} />;
}
