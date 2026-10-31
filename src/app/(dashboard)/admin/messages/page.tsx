import { listSentAdminMessages } from "@/lib/mail";
import { listAnnouncements } from "@/lib/announcements";
import { getOverviewStats } from "@/lib/admin";
import { MessageComposer } from "@/components/admin/MessageComposer";
import { AnnouncementManager } from "@/components/admin/AnnouncementManager";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { PageBack } from "@/components/ui/BackLink";

export const metadata = { title: "Admin: Messages" };

export default async function AdminMessagesPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const announcementsTab = searchParams.tab === "announcements";

  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/admin" />
        <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Messages</h1>
      </div>

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
  return <MessageComposer sent={sent.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), readAt: m.readAt ? m.readAt.toISOString() : null }))} />;
}

async function Announcements() {
  const [announcements, stats] = await Promise.all([listAnnouncements(), getOverviewStats()]);
  return <AnnouncementManager initialAnnouncements={announcements} totalUsers={stats.totalUsers} />;
}
