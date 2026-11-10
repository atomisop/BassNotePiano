import { listSentAdminMessages } from "@/lib/mail";
import { listAnnouncements } from "@/lib/announcements";
import { getOverviewStats } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { parseMessageRecipients } from "@/lib/commandRecents";
import { MessageComposer } from "@/components/admin/MessageComposer";
import { AnnouncementManager } from "@/components/admin/AnnouncementManager";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import type { MessageRecipient } from "./actions";
import { SentView } from "../sent/_view";

export async function MessagesView(props: { searchParams: Promise<{ tab?: string; to?: string | string[]; q?: string; channel?: string; who?: string; days?: string; user?: string; view?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const announcementsTab = searchParams.tab === "announcements";
  const sentTab = searchParams.tab === "sent";

  return (
    <div>
      <h1 className="sr-only">Messages</h1>

      <div className="mt-6">
        <AdminFilterTabs
          label="Message type"
          items={[
            { label: "Direct", href: "/admin/support?section=messages", active: !announcementsTab && !sentTab },
            { label: "Announcements", href: "/admin/support?section=messages&tab=announcements", active: announcementsTab },
            { label: "Sent", href: "/admin/support?section=messages&tab=sent", active: sentTab },
          ]}
        />
      </div>

      <div className="mt-6">{sentTab ? <SentView searchParams={Promise.resolve(searchParams)} /> : announcementsTab ? <Announcements /> : <Direct to={parseMessageRecipients(searchParams.to)} />}</div>
    </div>
  );
}

/** `?to=<id>,<id>` (the Accounts list's "Message", other screens' links) opens the composer with those people filled in. */
async function Direct({ to }: { to: string[] }) {
  const [sent, found] = await Promise.all([
    listSentAdminMessages(),
    to.length ? prisma.user.findMany({ where: { id: { in: to } }, select: { id: true, name: true, email: true } }) : Promise.resolve([] as MessageRecipient[]),
  ]);
  // Keep the order they were picked in.
  const prefill = to.map((id) => found.find((u) => u.id === id)).filter((u): u is MessageRecipient => !!u);
  return (
    <MessageComposer
      key={to.join(",")}
      prefill={prefill}
      sent={sent.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), readAt: m.readAt ? m.readAt.toISOString() : null }))}
    />
  );
}

async function Announcements() {
  const [announcements, stats] = await Promise.all([listAnnouncements(), getOverviewStats()]);
  return <AnnouncementManager initialAnnouncements={announcements} totalUsers={stats.totalUsers} />;
}
