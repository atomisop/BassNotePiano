import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";
import { accountAuditWhere } from "@/lib/accountAudit";
import { AUDIT_KIND_LABEL, AUDIT_PAGE_SIZE, auditKind, auditLabel } from "@/lib/auditView";
import { buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/Hint";
import { ChevronRight } from "@/components/ui/appIcons";


const DAY = 86_400_000;
const DAYS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const field = "h-11 w-full rounded-lg bg-neu-base px-3 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

export async function ActivityView(props: { searchParams: Promise<{ q?: string; kind?: string; days?: string; user?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 data-page-title="" className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Activity<Hint className="ml-1.5">Only the owner can see the activity log.</Hint></h1>
      </div>
    );
  }

  const q = (sp.q ?? "").trim().slice(0, 80);
  const days = DAYS.some((d) => d.value === sp.days) ? (sp.days as string) : "30";
  const userId = (sp.user ?? "").slice(0, 64);
  const kind = (sp.kind ?? "").replace(/[^a-z_]/g, "").slice(0, 30);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));

  // One person's history matches their own id and their plans', payments' and classes' ids, where most money and class changes are logged.
  const personWhere = userId ? await accountAuditWhere(userId) : {};
  const where = {
    ...(days !== "all" ? { createdAt: { gte: new Date(Date.now() - Number(days) * DAY) } } : {}),
    ...(kind ? { action: { startsWith: `${kind}.` } } : {}),
    ...personWhere,
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { detail: { contains: q, mode: "insensitive" as const } }, { actorEmail: { contains: q, mode: "insensitive" as const } }] } : {}),
  };

  const [rows, total, kindRows, person] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }) : null,
  ]);
  const kinds = [...new Set(kindRows.map((r) => auditKind(r.action)))].sort();
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const link = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = { q, kind, days, user: userId, page: "1", ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, v === null ? "" : String(v)])) };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "days" && v === "30") && !(k === "page" && v === "1")) p.set(k, v);
    p.set("section", "activity");
    return `/admin/security?${p}`;
  };

  return (
    <div>
      <h1 className="sr-only">Activity<Hint className="ml-1.5">Everything done in the admin that changes money, access, prices or settings: who did it, what and when.</Hint></h1>

      <form method="get" action="/admin/security" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter the activity log">
        <input type="hidden" name="section" value="activity" />
        {userId && <input type="hidden" name="user" value={userId} />}
        <div className="sm:col-span-2">
          <label htmlFor="act-q" className="text-small font-medium text-slate-200">Search</label>
          <input id="act-q" name="q" type="search" defaultValue={q} placeholder="A name, an email, a word in the details" className={`${field} mt-1`} />
        </div>
        <div>
          <label htmlFor="act-kind" className="text-small font-medium text-slate-200">Kind of change</label>
          <select id="act-kind" name="kind" defaultValue={kind} className={`${field} mt-1`}>
            <option value="">Everything</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{AUDIT_KIND_LABEL[k] ?? k}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="act-days" className="text-small font-medium text-slate-200">When</label>
          <select id="act-days" name="days" defaultValue={days} className={`${field} mt-1`}>
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonVariants({ variant: "primary", size: "sm", className: "text-black" })}>Search</button>
          {(q || kind || userId || days !== "30") && (
            <Link href="/admin/security?section=activity" className={buttonVariants({ variant: "secondary", size: "sm" })}>Clear filters</Link>
          )}
          {person && (
            <span className="text-small text-slate-300">
              Only changes to <Link href={`/admin/users/${userId}`} className="underline underline-offset-4">{person.name ?? person.email}</Link>, their plans, payments and classes
            </span>
          )}
        </div>
      </form>

      <p className="mt-5 text-small text-slate-500" role="status">
        {total === 0 ? "Nothing matches." : `${total.toLocaleString("en-US")} change${total === 1 ? "" : "s"}${pageCount > 1 ? `, page ${page} of ${pageCount}` : ""}`}
      </p>

      {rows.length > 0 && (
        <ul className="glass-surface mt-2 divide-y divide-slate-50/8 px-4">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              {/* What changed first and brightest; the details under it; who did it and when are quiet. */}
              <div className="flex items-baseline justify-between gap-x-4">
                <p className="min-w-0 text-body font-semibold text-slate-50">{auditLabel(r.action)}</p>
                <p className="shrink-0 text-caption tabular-nums text-slate-500">{when(r.createdAt)}</p>
              </div>
              {r.detail && <p className="mt-0.5 break-words text-small text-slate-300">{r.detail}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate-500">
                <span className="min-w-0 break-all">{r.actorEmail ?? "The system"}</span>
                {r.targetType === "User" && r.targetId && (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={`/admin/users/${r.targetId}`} className="tap inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-100">
                      Open the account
                      <ChevronRight aria-hidden className="h-3 w-3" />
                    </Link>
                    <span aria-hidden>·</span>
                    <Link href={link({ user: r.targetId, page: 1 })} className="tap inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-100">
                      All changes to it
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
    </div>
  );
}
