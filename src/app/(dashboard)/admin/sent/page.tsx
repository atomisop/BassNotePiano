import Link from "next/link";
import { Hint } from "@/components/ui/Hint";
import { prisma } from "@/lib/prisma";
import { groupSentNotices, listSentNotices, NOTICE_PAGE_SIZE, type NoticeAudience, type NoticeChannel } from "@/lib/adminNotices";
import { buttonVariants } from "@/components/ui/button";
import { ChevronRight } from "@/components/ui/appIcons";

export const metadata = { title: "Admin: Sent" };

const DAYS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const whenDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const field = "h-11 w-full rounded-lg bg-neu-base px-2.5 sm:px-3 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";
const CHANNEL_LABEL = { bell: "Bell", mail: "Mail", email: "Email" } as const;
/**
 * An email's outcome: quiet when it arrived or was opened (the normal case needs no colour), red when it bounced, failed or was marked
 * as spam, amber otherwise. Colour is kept for the rows that need a look (DESIGN.md, Hierarchy rule 5).
 */
function deliveryTone(status: string): string {
  if (status === "OPENED" || status === "CLICKED" || status === "DELIVERED") return "text-slate-400";
  if (status === "BOUNCED" || status === "COMPLAINED" || status === "FAILED") return "font-medium text-red-300";
  return "text-amber-300";
}
/** A small quiet link at the end of a meta line (no underline: it is not inside a sentence). */
const metaLink = "tap inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-100";

/** Admin > Inbox > Sent: which notice went to whom, from the bell, Mail and email, and whether they got it. */
export default async function AdminSentPage(props: { searchParams: Promise<{ q?: string; channel?: string; who?: string; days?: string; user?: string; view?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const channel: NoticeChannel = sp.channel === "bell" || sp.channel === "mail" || sp.channel === "email" ? sp.channel : "all";
  const who: NoticeAudience = sp.who === "students" || sp.who === "admins" ? sp.who : "all";
  const days = DAYS.some((d) => d.value === sp.days) ? (sp.days as string) : "30";
  const userId = (sp.user ?? "").slice(0, 64);
  const view = sp.view === "messages" ? "messages" : "people";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const filter = { q, channel, who, days: days === "all" ? null : Number(days), userId, page };

  const [list, groups, person] = await Promise.all([
    view === "people" ? listSentNotices(filter) : null,
    view === "messages" ? groupSentNotices(filter) : null,
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }) : null,
  ]);
  const total = list?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / NOTICE_PAGE_SIZE));
  const link = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = { q, channel, who, days, user: userId, view, page: "1", ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, v === null ? "" : String(v)])) };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "days" && v === "30") && !(k === "page" && v === "1") && !(k === "view" && v === "people") && !(k === "channel" && v === "all") && !(k === "who" && v === "all")) p.set(k, v);
    return `/admin/sent${p.toString() ? `?${p}` : ""}`;
  };
  const filtered = Boolean(q || userId || days !== "30" || channel !== "all" || who !== "all");

  return (
    <div>
      <h1 className="sr-only">Sent</h1>

      <div role="group" aria-label="How to list them" className="mt-5 flex w-fit gap-1.5 rounded-full bg-neu-base p-1 shadow-pressed-low">
        {[
          { id: "people", label: "To each person" },
          { id: "messages", label: "By message" },
        ].map((v) => (
          <Link
            key={v.id}
            href={link({ view: v.id, page: 1 })}
            aria-current={view === v.id ? "page" : undefined}
            className={`tap rounded-full px-4 py-1.5 text-small font-medium ${view === v.id ? "bg-neu-base text-signal-fg shadow-raised-low" : "text-slate-400 hover:text-slate-200"}`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/sent" className="mt-5 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]" role="search" aria-label="Filter what was sent">
        {userId && <input type="hidden" name="user" value={userId} />}
        {view === "messages" && <input type="hidden" name="view" value="messages" />}
        <div className="col-span-3 lg:col-span-4">
          <label htmlFor="sent-q" className="text-small font-medium text-slate-200">Search</label>
          <input id="sent-q" name="q" type="search" defaultValue={q} placeholder="A name, an email, a word in the notice" className={`${field} mt-1`} />
        </div>
        <div>
          <label htmlFor="sent-channel" className="text-small font-medium text-slate-200">Where</label>
          <select id="sent-channel" name="channel" defaultValue={channel} className={`${field} mt-1 px-2`}>
            <option value="all">All</option>
            <option value="bell">Bell</option>
            <option value="mail">Mail</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div>
          <label htmlFor="sent-who" className="text-small font-medium text-slate-200">To</label>
          <select id="sent-who" name="who" defaultValue={who} className={`${field} mt-1`}>
            <option value="all">Everyone</option>
            <option value="students">Students</option>
            <option value="admins">Admins</option>
          </select>
        </div>
        <div>
          <label htmlFor="sent-days" className="text-small font-medium text-slate-200">When</label>
          <select id="sent-days" name="days" defaultValue={days} className={`${field} mt-1`}>
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-3 flex items-end gap-2 lg:col-span-1">
          <button type="submit" className={buttonVariants({ variant: "primary", size: "sm", className: "h-11 text-black" })}>Search</button>
          {filtered && <Link href={view === "messages" ? "/admin/sent?view=messages" : "/admin/sent"} className={buttonVariants({ variant: "secondary", size: "sm", className: "h-11" })}>Clear</Link>}
        </div>
      </form>

      {person && (
        <p className="mt-3 text-small text-slate-300">
          Only what went to <Link href={`/admin/users/${userId}`} className="underline underline-offset-4">{person.name ?? person.email}</Link>
        </p>
      )}

      {list && (
        <>
          <p className="mt-5 text-small text-slate-500" role="status">
            {total === 0 ? "Nothing matches." : `${total.toLocaleString("en-US")} sent${pageCount > 1 ? `, page ${page} of ${pageCount}` : ""}`}
          </p>
          {list.rows.length > 0 && (
            <ul className="glass-surface mt-2 divide-y divide-slate-50/8 px-4">
              {list.rows.map((r) => (
                <li key={`${r.channel}-${r.id}`} className="py-3">
                  {/* Who it went to first, then what it was; when and where are quiet. */}
                  <div className="flex items-baseline justify-between gap-x-4">
                    <p className="min-w-0 truncate text-body font-semibold text-slate-50">
                      {r.userId ? (
                        <Link href={`/admin/users/${r.userId}`} className="tap inline-flex max-w-full items-center underline-offset-4 hover:underline">
                          <span className="truncate">{r.name ?? r.email}</span>
                        </Link>
                      ) : (
                        <span>{r.email}</span>
                      )}
                    </p>
                    <p className="shrink-0 text-caption tabular-nums text-slate-500">{when(r.at)}</p>
                  </div>
                  <p className="mt-0.5 text-small font-medium text-slate-200">{r.title}</p>
                  {r.body && <p className="mt-0.5 line-clamp-2 break-words text-small text-slate-400">{r.body}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate-500">
                    <span>{CHANNEL_LABEL[r.channel]}</span>
                    {r.isAdmin && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Admin</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    {r.delivery ? (
                      <>
                        <span className={deliveryTone(r.delivery.status)}>{r.delivery.label}</span>
                        {r.delivery.detail && <span>({r.delivery.detail})</span>}
                        {r.delivery.openedAt && <span>· opened {when(r.delivery.openedAt)}</span>}
                      </>
                    ) : (
                      <>
                        <span>{r.kind}</span>
                        <span aria-hidden>·</span>
                        <span className={r.read ? "text-slate-500" : "text-slate-400"}>{r.read ? "Read" : "Not read yet"}</span>
                      </>
                    )}
                    {r.userId && (
                      <>
                        <span aria-hidden>·</span>
                        <Link href={link({ user: r.userId, page: 1 })} className={metaLink}>
                          All sent to them
                          <ChevronRight aria-hidden className="h-3 w-3" />
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {pageCount > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-small">
              {page > 1 ? <Link href={link({ page: page - 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>Newer</Link> : <span />}
              <span className="text-slate-500">Page {page} of {pageCount}</span>
              {page < pageCount ? <Link href={link({ page: page + 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>Older</Link> : <span />}
            </nav>
          )}
        </>
      )}

      {groups && (
        <>
          <p className="mt-5 text-small text-slate-500" role="status">
            {groups.length === 0 ? "Nothing matches." : `${groups.length} different message${groups.length === 1 ? "" : "s"}`}
          </p>
          {groups.length > 0 && (
            <ul className="glass-surface mt-2 divide-y divide-slate-50/8 px-4">
              {groups.map((g) => (
                <li key={`${g.channel}-${g.title}`} className="py-3">
                  <div className="flex items-baseline justify-between gap-x-4">
                    <p className="min-w-0 text-body font-semibold text-slate-50">{g.title}</p>
                    <p className="shrink-0 text-small text-slate-500">
                      <span className="text-body font-semibold tabular-nums text-slate-50">{g.count.toLocaleString("en-US")}</span> sent
                    </p>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate-500">
                    <span>{CHANNEL_LABEL[g.channel]}</span>
                    <span aria-hidden>·</span>
                    <span>{whenDay(g.firstAt) === whenDay(g.lastAt) ? whenDay(g.lastAt) : `${whenDay(g.firstAt)} to ${whenDay(g.lastAt)}`}</span>
                    <span aria-hidden>·</span>
                    <Link href={link({ q: g.title, view: "people", page: 1, channel: g.channel })} className={metaLink}>
                      Who got it
                      <ChevronRight aria-hidden className="h-3 w-3" />
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-6 text-small text-slate-500"><Hint>Bell notices, Mail messages and emails are listed. Delivered, opened and bounced come from Resend once its webhook is set up; emails are kept here for 180 days.</Hint></p>
    </div>
  );
}
