import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupportThreadSource } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth";
import { getSupportThreads } from "@/lib/support";
import { SupportThreadList, type SupportListFilter } from "@/components/admin/SupportThreadList";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { AdminFilterTabs } from "@/components/admin/AdminFilterTabs";
import { FigureLead } from "@/components/admin/AdminLead";
import { Check, Inbox, List, User } from "@/components/ui/appIcons";
import { SectionPills } from "@/components/admin/SectionPills";
import { MessagesView } from "../messages/_view";

// Each status is an icon, the chosen one with its word, so the four share one line with Chat and Email on a phone.
const FILTERS: { label: string; value: SupportListFilter; param: string; icon: React.ReactNode }[] = [
  { label: "Open", value: "OPEN", param: "open", icon: <Inbox /> },
  { label: "Resolved", value: "RESOLVED", param: "resolved", icon: <Check /> },
  { label: "All", value: "ALL", param: "all", icon: <List /> },
  { label: "Assigned to me", value: "MINE", param: "mine", icon: <User /> },
];

const SOURCES: { label: string; value: SupportThreadSource; param: string }[] = [
  { label: "Chat", value: "CHAT", param: "chat" },
  { label: "Email", value: "EMAIL", param: "email" },
];

export const metadata = { title: "Admin: Support chat" };

async function ChatsView(
  props: {
    searchParams: Promise<{ filter?: string; status?: string; source?: string; thread?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  // Old links opened a conversation beside the list; every conversation has its own page now.
  if (searchParams.thread) redirect(`/admin/support/${encodeURIComponent(searchParams.thread)}`);

  const session = await getServerAuthSession();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  const currentAdminId = session.user.id;

  // ?status= is what older links used.
  const requested = (searchParams.filter ?? searchParams.status)?.toLowerCase();
  const activeFilter = FILTERS.find((f) => f.param === requested)?.value ?? "OPEN";
  const activeSource = SOURCES.find((s) => s.param === searchParams.source?.toLowerCase())?.value ?? "CHAT";
  const mine = activeFilter === "MINE";

  const threads = mine
    ? await getSupportThreads(undefined, undefined, undefined, currentAdminId)
    : await getSupportThreads(activeFilter === "ALL" ? undefined : activeFilter, undefined, activeSource);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  const hrefFor = (filter: SupportListFilter, source: SupportThreadSource) => {
    const query = [
      source === "EMAIL" && filter !== "MINE" ? "source=email" : null,
      filter === "OPEN" ? null : `filter=${FILTERS.find((f) => f.value === filter)!.param}`,
    ]
      .filter(Boolean)
      .join("&");
    return `/admin/support${query ? `?${query}` : ""}`;
  };
  const noun = mine ? "case" : activeSource === "EMAIL" ? "email thread" : "conversation";

  return (
    <div>
      <h1 className="sr-only">Support Chat</h1>
      {/* The Inbox's one fact, figure first: how many are waiting (or how many the chosen view holds). */}
      <FigureLead
        className="mt-5"
        figure={threads.length}
        label={
          mine
            ? `case${threads.length === 1 ? "" : "s"} assigned to you`
            : activeFilter === "OPEN"
              ? `open ${noun}${threads.length === 1 ? "" : "s"}${threads.length === 0 ? ", all clear" : ""}`
              : `${noun}${threads.length === 1 ? "" : "s"} · ${activeLabel.toLowerCase()}`
        }
      />

      {/* Where it came from and its status share one line: two words, then four icons. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label="Where it came from" className={TAB_TRACK}>
          {SOURCES.map((source) => (
            <Link
              key={source.value}
              href={hrefFor(mine ? "OPEN" : activeFilter, source.value)}
              aria-current={!mine && activeSource === source.value ? "page" : undefined}
              className={tabItem(!mine && activeSource === source.value)}
            >
              {source.label}
            </Link>
          ))}
        </nav>
        <AdminFilterTabs
          label="Status"
          iconOnly
          items={FILTERS.map((filter) => ({ label: filter.label, icon: filter.icon, href: hrefFor(filter.value, activeSource), active: activeFilter === filter.value }))}
        />
      </div>

      <div className="mt-4">
        <SupportThreadList
          initialThreads={threads}
          source={activeSource}
          filter={activeFilter}
          currentAdminId={currentAdminId}
          emptyMessage={
            mine
              ? "No cases have been transferred to you."
              : activeSource === "EMAIL"
                ? activeFilter === "OPEN" ? "No open emails." : `No ${activeLabel.toLowerCase()} emails.`
                : activeFilter === "OPEN" ? "No open conversations." : `No ${activeLabel.toLowerCase()} conversations.`
          }
        />
      </div>
    </div>
  );
}

/** Chats and Messages are one Inbox (2026-11-10): what people send the studio, and what the studio sends them. */
export default async function AdminSupportPage(props: { searchParams: Promise<{ section?: string; filter?: string; status?: string; source?: string; thread?: string; tab?: string; to?: string | string[]; q?: string; channel?: string; who?: string; days?: string; user?: string; view?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const section = sp.section === "messages" ? "messages" : null;
  return (
    <div>
      <SectionPills base="/admin/support" label="Inbox views" active={section} items={[{ label: "Chats", value: null }, { label: "Messages", value: "messages" }]} />
      {section ? <MessagesView searchParams={Promise.resolve(sp)} /> : <ChatsView searchParams={Promise.resolve(sp)} />}
    </div>
  );
}
