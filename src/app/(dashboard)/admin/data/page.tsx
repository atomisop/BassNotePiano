import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { Card } from "@/components/ui/Card";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";
import { ChevronRight } from "@/components/ui/appIcons";
import { getCollectedInventory, getInsightInputs, getPeopleRows, getScaleReport, type CellState, type PersonRow, type ScaleReportRow } from "@/lib/adminData";
import { buildInsights, MIN_SAMPLE, STALL_DAYS, type Insight } from "@/lib/adminInsightsRules";

export const metadata = { title: "Admin: Data" };

const TABS = [
  { value: "scales", label: "Scales" },
  { value: "people", label: "People" },
  { value: "collected", label: "Collected" },
  { value: "insights", label: "Insights" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const shortDate = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "Never");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export default async function AdminDataPage(props: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await props.searchParams;
  const session = await getServerAuthSession();
  if (!isOwnerEmail(session?.user.email)) {
    return (
      <div>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Data</h1>
        <p className="mt-2 text-small text-slate-500">Only the owner can see this.</p>
      </div>
    );
  }
  const tab: Tab = TABS.some((t) => t.value === sp.tab) ? (sp.tab as Tab) : "scales";
  const q = (sp.q ?? "").slice(0, 80);

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Data</h1>
      <p className="mt-2 max-w-2xl text-small text-slate-400">Everything the app keeps about your students, read in one place. Nothing on this page changes anything.</p>

      <nav aria-label="Data views" className={`mt-5 ${TAB_TRACK}`}>
        {TABS.map((t) => (
          <Link key={t.value} href={`/admin/data?tab=${t.value}`} aria-current={tab === t.value ? "page" : undefined} className={tabItem(tab === t.value)}>
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "scales" && <ScalesView />}
        {tab === "people" && <PeopleView q={q} />}
        {tab === "collected" && <CollectedView />}
        {tab === "insights" && <InsightsView />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scales: a funnel per scale, then who is where
// ---------------------------------------------------------------------------

async function ScalesView() {
  const report = await getScaleReport();
  const learning = report.grid.length;
  const finished = report.scales.reduce((n, s) => n + s.completed, 0);
  const stalled = report.scales.reduce((n, s) => n + s.stalled, 0);

  return (
    <div className="grid gap-6">
      <dl className="grid grid-cols-3 gap-3">
        <Figure label="Students on a scale" value={learning} />
        <Figure label="Scales finished" value={finished} />
        <Figure label={`Stuck ${STALL_DAYS}+ days`} value={stalled} />
      </dl>

      <section aria-labelledby="by-scale" className="grid gap-3">
        <div>
          <h2 id="by-scale" className="text-title font-semibold text-slate-50">Progress by scale</h2>
          <p className="mt-0.5 text-small text-slate-500">Each bar is a step of the scale&apos;s checklist, out of everyone who has the scale open.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {report.scales.map((s) => (
            <ScaleCard key={s.id} scale={s} />
          ))}
        </div>
      </section>

      <section aria-labelledby="who-where" className="grid gap-3">
        <div>
          <h2 id="who-where" className="text-title font-semibold text-slate-50">Who is where</h2>
          <p className="mt-0.5 text-small text-slate-500">One row per student, one square per scale, most finished first.</p>
        </div>
        <Legend />
        {report.grid.length === 0 ? (
          <Card className="text-small text-slate-500">No student has a scale open yet.</Card>
        ) : (
          <Card padded={false} className="overflow-x-auto">
            <table className="w-full min-w-max text-small">
              <thead>
                <tr className="text-slate-500">
                  <th scope="col" className="sticky left-0 z-10 bg-neu-base px-4 py-3 text-left font-medium">Student</th>
                  {report.scales.map((s) => (
                    <th key={s.id} scope="col" title={s.title} className="px-1 py-3 text-center font-medium tabular-nums">
                      {s.code.replace(/^Scale\s*/i, "")}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right font-medium">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--neu-edge)">
                {report.grid.map((row) => (
                  <tr key={row.userId}>
                    <th scope="row" className="sticky left-0 z-10 max-w-44 truncate bg-neu-base px-4 py-2 text-left font-medium">
                      <Link href={`/admin/users/${row.userId}`} className="text-slate-100 hover:underline">
                        {row.name}
                      </Link>
                    </th>
                    {row.cells.map((state, i) => (
                      <td key={i} className="px-1 py-2 text-center">
                        <Cell state={state} label={`${report.scales[i].code}: ${CELL_LABEL[state]}`} />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{row.finished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}

function ScaleCard({ scale: s }: { scale: ScaleReportRow }) {
  const steps = [
    { label: "Module read", value: s.moduleRead },
    { label: "Practice done", value: s.practiceDone },
    { label: "Finished", value: s.completed },
  ];
  return (
    <Card className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-small text-slate-500">
            {s.code}
            {s.roadmap ? `, ${s.roadmap}` : ""}
          </p>
          <h3 className="truncate text-body font-semibold text-slate-50">{s.title}</h3>
        </div>
        <p className="shrink-0 text-small tabular-nums text-slate-400">{s.unlocked} open</p>
      </div>

      {s.unlocked === 0 ? (
        <p className="text-small text-slate-500">Nobody has this scale open yet.</p>
      ) : (
        <ul className="grid gap-2.5" aria-label={`${s.code} checklist`}>
          {steps.map((step, i) => (
            <li key={step.label} className="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-small">
              <span className="text-slate-300">{step.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-neu-lift" aria-hidden>
                <span className={`block h-full origin-left rounded-full ${i === steps.length - 1 ? "bg-signal" : "bg-slate-400"}`} style={{ transform: `scaleX(${s.unlocked ? step.value / s.unlocked : 0})` }} />
              </span>
              <span className="text-right tabular-nums text-slate-200">
                {step.value} <span className="text-slate-500">({pct(step.value, s.unlocked)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-(--neu-edge) pt-3 text-small sm:grid-cols-4">
        <Fact label="Stuck" value={s.stalled ? `${s.stalled}` : "None"} warn={s.stalled > 0} />
        <Fact label="First-try pass" value={s.quizTakers ? `${s.quizFirstTryPassed} of ${s.quizTakers}` : "No quiz yet"} />
        <Fact label="Average quiz" value={s.avgQuizScore === null ? "No quiz yet" : `${s.avgQuizScore}%`} />
        <Fact label="Days to finish" value={s.medianDaysToFinish === null ? "None yet" : `${s.medianDaysToFinish} (median)`} />
      </dl>

      {s.lessons.length > 0 && (
        <details className="group">
          <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-small font-medium text-slate-300 hover:text-slate-100 [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-open:rotate-90" />
            Lessons finished ({s.lessons.length})
          </summary>
          <ol className="mt-2 grid gap-1.5">
            {s.lessons.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-small">
                <span className="min-w-0 truncate text-slate-300">{l.title}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {l.done} of {s.unlocked}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}

const CELL_LABEL: Record<CellState, string> = { done: "finished", working: "working on it", open: "open, not started", locked: "not open" };

function Cell({ state, label }: { state: CellState; label: string }) {
  const look: Record<CellState, string> = {
    done: "bg-signal",
    working: "bg-signal/35",
    open: "border border-slate-500",
    locked: "bg-neu-lift",
  };
  return <span role="img" aria-label={label} title={label} className={`inline-block h-5 w-5 rounded-sm align-middle ${look[state]}`} />;
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-small text-slate-400">
      {(["done", "working", "open", "locked"] as CellState[]).map((s) => (
        <li key={s} className="flex items-center gap-2">
          <Cell state={s} label="" />
          <span className="first-letter:uppercase">{CELL_LABEL[s]}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// People: every student's figures, grouped the same way on every row
// ---------------------------------------------------------------------------

const GROUPS: { title: string; cols: { label: string; value: (p: PersonRow) => string; num?: boolean }[] }[] = [
  {
    title: "Account",
    cols: [
      { label: "Joined", value: (p) => shortDate(p.joined) },
      { label: "Last seen", value: (p) => shortDate(p.lastSeen) },
      { label: "Phone", value: (p) => (p.phone ? (p.phoneVerified ? "Confirmed" : "Typed") : "None") },
      { label: "Discord", value: (p) => (p.discord ? "Linked" : "No") },
      { label: "Devices", value: (p) => String(p.devices), num: true },
    ],
  },
  {
    title: "Learning",
    cols: [
      { label: "On scale", value: (p) => p.currentScale ?? "None" },
      { label: "Finished", value: (p) => String(p.scalesDone), num: true },
      { label: "Practice 7d", value: (p) => `${p.practiceDays7}/7`, num: true },
      { label: "Streak", value: (p) => String(p.streak), num: true },
    ],
  },
  {
    title: "Classes and money",
    cols: [
      { label: "Plan", value: (p) => p.plan ?? (p.trial ? "Trial" : "None") },
      { label: "Credits", value: (p) => String(p.credits), num: true },
      { label: "Attended", value: (p) => String(p.classesAttended), num: true },
      { label: "No-shows", value: (p) => String(p.noShows), num: true },
    ],
  },
  {
    title: "Help",
    cols: [
      { label: "Atom messages", value: (p) => String(p.atomMessages), num: true },
      { label: "Support threads", value: (p) => String(p.supportThreads), num: true },
    ],
  },
];

async function PeopleView({ q }: { q: string }) {
  const rows = await getPeopleRows(q);
  return (
    <div className="grid gap-4">
      <form action="/admin/data" className="flex max-w-md gap-2">
        <input type="hidden" name="tab" value="people" />
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search a name or email"
          aria-label="Search students"
          className="h-11 min-w-0 flex-1 rounded-full border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
      <p className="text-small text-slate-500">
        {rows.length} {rows.length === 1 ? "student" : "students"}
        {q ? ` matching "${q}"` : ""}. Admins and banned accounts are left out.
      </p>

      {rows.length === 0 ? (
        <Card className="text-small text-slate-500">{q ? "Nobody matches that search." : "No students yet."}</Card>
      ) : (
        <>
          {/* Computers: one table, columns grouped under four headings. */}
          <Card padded={false} className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-max text-small">
              <thead>
                <tr className="text-slate-400">
                  <th rowSpan={2} scope="col" className="sticky left-0 z-10 bg-neu-base px-4 pb-2 pt-3 text-left align-bottom font-medium">
                    Student
                  </th>
                  {GROUPS.map((g) => (
                    <th key={g.title} colSpan={g.cols.length} scope="colgroup" className="border-l border-(--neu-edge) px-3 pt-3 text-left font-semibold text-slate-200">
                      {g.title}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-(--neu-edge) text-slate-500">
                  {GROUPS.flatMap((g) =>
                    g.cols.map((c, i) => (
                      <th key={`${g.title}:${c.label}`} scope="col" className={`whitespace-nowrap px-3 pb-2 pt-1 font-medium ${c.num ? "text-right" : "text-left"} ${i === 0 ? "border-l border-(--neu-edge)" : ""}`}>
                        {c.label}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-(--neu-edge)">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-neu-lift/60">
                    <th scope="row" className="sticky left-0 z-10 bg-neu-base px-4 py-2.5 text-left font-normal">
                      <Link href={`/admin/users/${p.id}`} className="block max-w-52 truncate font-medium text-slate-100 hover:underline">
                        {p.name}
                      </Link>
                      <span className="block max-w-52 truncate text-slate-500">{p.email}</span>
                    </th>
                    {GROUPS.flatMap((g) =>
                      g.cols.map((c, i) => (
                        <td key={`${g.title}:${c.label}`} className={`whitespace-nowrap px-3 py-2.5 text-slate-300 ${c.num ? "text-right tabular-nums" : ""} ${i === 0 ? "border-l border-(--neu-edge)" : ""}`}>
                          {c.value(p)}
                        </td>
                      )),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Phones: one card per student, the same four groups stacked. */}
          <ul className="grid gap-3 md:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Card className="grid gap-3">
                  <Link href={`/admin/users/${p.id}`} className="min-w-0">
                    <span className="block truncate text-body font-semibold text-slate-50">{p.name}</span>
                    <span className="block truncate text-small text-slate-500">{p.email}</span>
                  </Link>
                  {GROUPS.map((g) => (
                    <div key={g.title} className="border-t border-(--neu-edge) pt-2.5">
                      <p className="text-small font-semibold text-slate-200">{g.title}</p>
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-small">
                        {g.cols.map((c) => (
                          <div key={c.label} className="flex justify-between gap-2">
                            <dt className="text-slate-500">{c.label}</dt>
                            <dd className="tabular-nums text-slate-200">{c.value(p)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collected: what the app keeps, in five groups
// ---------------------------------------------------------------------------

async function CollectedView() {
  const groups = await getCollectedInventory();
  return (
    <div className="grid gap-6">
      <p className="max-w-2xl text-small text-slate-400">
        Every kind of record the app keeps about people, grouped, with how many there are right now.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title} className="grid content-start gap-3">
            <h2 className="text-title font-semibold text-slate-50">{g.title}</h2>
            <ul className="divide-y divide-(--neu-edge)">
              {g.items.map((item) => (
                <li key={item.what} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-small font-medium text-slate-100">{item.what}</p>
                    <p className="text-small text-slate-500">{item.detail}</p>
                    {item.kept && <p className="mt-0.5 text-small text-slate-400">{item.kept}</p>}
                  </div>
                  <p className="shrink-0 text-small tabular-nums text-slate-300">{item.rows.toLocaleString("en-US")}</p>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights: what could get better
// ---------------------------------------------------------------------------

const TONE: Record<Insight["tone"], { label: string; chip: string }> = {
  fix: { label: "To fix", chip: "bg-red-400/15 text-red-300" },
  watch: { label: "Worth a look", chip: "bg-amber-300/15 text-amber-300" },
  good: { label: "Going well", chip: "bg-emerald-400/15 text-emerald-400" },
};

async function InsightsView() {
  const report = await getScaleReport();
  const insights = buildInsights(await getInsightInputs(report));
  const groups = (["fix", "watch", "good"] as const).map((tone) => ({ tone, items: insights.filter((i) => i.tone === tone) })).filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-6">
      <p className="max-w-2xl text-small text-slate-400">
        The app reads your own numbers (scale progress, quizzes, practice, classes, Atom ratings, trials and bills) and writes down what stands out. Nothing leaves your
        server. A check needs at least {MIN_SAMPLE} people before it says anything.
      </p>

      {groups.length === 0 ? (
        <Card className="text-small text-slate-400">Nothing stands out yet. As more students use the app, findings appear here.</Card>
      ) : (
        groups.map((g) => (
          <section key={g.tone} aria-labelledby={`insights-${g.tone}`} className="grid gap-3">
            <h2 id={`insights-${g.tone}`} className="text-title font-semibold text-slate-50">
              {TONE[g.tone].label} <span className="text-slate-500">({g.items.length})</span>
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.items.map((i) => (
                <Card key={i.id} className="grid content-start gap-2">
                  <span className={`w-fit rounded-full px-2.5 py-0.5 text-small font-medium ${TONE[i.tone].chip}`}>{TONE[i.tone].label}</span>
                  <h3 className="text-body font-semibold text-slate-50">{i.title}</h3>
                  <p className="text-small text-slate-300">{i.evidence}</p>
                  <p className="text-small text-slate-400">
                    <span className="font-medium text-slate-200">Try this: </span>
                    {i.tryThis}
                  </p>
                  {i.href && (
                    <Link href={i.href} className="tap mt-1 inline-flex w-fit items-center gap-1 text-small font-medium text-signal-fg hover:underline">
                      Open it
                      <ChevronRight aria-hidden className="h-4 w-4" />
                    </Link>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))
      )}

      <details className="group max-w-2xl">
        <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-small font-medium text-slate-300 hover:text-slate-100 [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-open:rotate-90" />
          What gets checked
        </summary>
        <ul className="mt-2 grid list-disc gap-1 pl-6 text-small text-slate-400">
          <li>The scale where the most students are stuck ({STALL_DAYS}+ days open, not finished)</li>
          <li>The quiz the fewest people pass on their first try</li>
          <li>A lesson finished far less often than the others in its scale</li>
          <li>Daily practice this week against last week</li>
          <li>No-shows, unmarked attendance and canceled classes in the last 30 days</li>
          <li>Thumbs up and down on Atom&apos;s answers in the last 30 days</li>
          <li>Free trials that became plans in the last 90 days</li>
          <li>Running plans with an overdue bill</li>
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <Card className="grid gap-1 !p-4">
      <dt className="text-small text-slate-400">{label}</dt>
      <dd className="text-headline font-semibold tabular-nums text-slate-50">{value}</dd>
    </Card>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`truncate tabular-nums ${warn ? "text-amber-300" : "text-slate-200"}`}>{value}</dd>
    </div>
  );
}
