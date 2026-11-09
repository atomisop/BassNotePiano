"use client";

import { useState } from "react";
import { Check, Circle, Flame, Lock } from "@/components/ui/appIcons";
import { Tabs } from "@/components/ui/Tabs";
import { ChildClasses } from "@/components/parent/ChildClasses";
import { ChildWeeklyTime, EndChildPlanButton } from "@/components/parent/ChildWeeklyTime";
import type { ChildView as ChildViewData } from "@/lib/parentChildren";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { Hint } from "@/components/ui/Hint";

type TabId = "progress" | "practice" | "classes" | "plan";

const DOT: Record<"done" | "partial" | "missed", string> = { done: "bg-emerald-400", partial: "bg-amber-400/70", missed: "bg-slate-700" };

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** One linked child, in four tabs: how far they have got, how they have practiced, their classes, and their plan. */
export function ChildView({ view, openMoveFor }: { view: ChildViewData; openMoveFor?: string | null }) {
  const [tab, setTab] = useState<TabId>("classes");
  const open = view.scales.filter((s) => !s.locked);
  return (
    <div className="mt-6">
      <dl className="mb-5 grid grid-cols-3 gap-2 text-small">
        <div className="rounded-xl bg-neu-base px-3 py-2.5 shadow-raised-low">
          <dt className="text-slate-500">Next class</dt>
          <dd className="mt-0.5 truncate font-medium text-slate-100">{view.upcoming[0] ? formatDateTime(view.upcoming[0].scheduledAt) : "None"}</dd>
        </div>
        <div className="rounded-xl bg-neu-base px-3 py-2.5 shadow-raised-low">
          <dt className="text-slate-500">Plan</dt>
          <dd className="mt-0.5 truncate font-medium text-slate-100">{view.plan ? view.plan.weeklyTime ?? "Active" : "None"}</dd>
        </div>
        <div className="rounded-xl bg-neu-base px-3 py-2.5 shadow-raised-low">
          <dt className="text-slate-500">Credits</dt>
          <dd className="mt-0.5 truncate font-medium tabular-nums text-slate-100">{view.creditsLabel}</dd>
        </div>
      </dl>
      <div className="lg:flex lg:justify-start">
        <Tabs
          label="Sections"
          items={[
            { id: "progress", label: "Progress" },
            { id: "practice", label: "Practice" },
            { id: "classes", label: "Classes", count: view.upcoming.length || undefined },
            { id: "plan", label: "Plan" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
        />
      </div>

      {tab === "progress" && (
        <section className="tab-in mt-6" aria-label="Progress">
          <p className="text-small text-slate-400">
            <span className="tabular-nums text-slate-50">{open.filter((s) => s.quizPassed).length}</span> of <span className="tabular-nums text-slate-50">{view.scales.length}</span> scales finished ·{" "}
            <span className="tabular-nums text-slate-50">{open.length}</span> open
          </p>
          <ul className="mt-3 space-y-2">
            {view.scales.map((s) => (
              <li key={s.slug} className="flex items-center justify-between gap-3 rounded-2xl bg-neu-base p-4 shadow-raised-low">
                <div className="min-w-0">
                  <p className="truncate text-small font-medium text-slate-100">
                    <span className="mr-2 font-mono text-slate-500">{s.code}</span>
                    {s.title}
                  </p>
                  {s.locked ? (
                    <p className="mt-1 flex items-center gap-1.5 text-small text-slate-500">
                      <Lock aria-hidden className="h-3.5 w-3.5" />
                      Not open yet
                    </p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-small" aria-label="Steps">
                      {[
                        { done: s.moduleRead, label: "Lesson read" },
                        { done: s.practiceCompleted, label: "Practice logged" },
                        { done: s.quizPassed, label: s.quizScore !== null ? `Quiz passed (${s.quizScore})` : "Quiz passed" },
                      ].map((step) => (
                        <li key={step.label} className={`flex items-center gap-1.5 ${step.done ? "text-slate-200" : "text-slate-500"}`}>
                          {step.done ? <Check aria-hidden className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} /> : <Circle aria-hidden className="h-3.5 w-3.5" />}
                          {step.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "practice" && (
        <section className="tab-in mt-6 rounded-2xl bg-neu-base p-5 shadow-raised-low" aria-label="Practice">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-small text-slate-400">
            <span>
              <span className="tabular-nums text-slate-50">{view.practice.doneLast7}/7</span> days this week
            </span>
            <span>
              <span className="tabular-nums text-slate-50">{view.practice.minutesLast7}</span> minutes
            </span>
            <span className="flex items-center gap-1">
              <Flame aria-hidden className="h-4 w-4 text-signal-fg" />
              <span className="tabular-nums text-slate-50">{view.practice.streak}</span> day streak
            </span>
            <span>
              Last full day <span className="text-slate-50">{view.practice.lastDoneDay ? dayLabel(view.practice.lastDoneDay) : "never"}</span>
            </span>
          </div>
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Daily practice, last 30 days, oldest first">
            {view.practice.strip.map((d) => (
              <li key={d.day} title={`${dayLabel(d.day)}: ${d.state === "done" ? "10 minutes done" : d.state === "partial" ? `${Math.floor(d.seconds / 60)} min` : "no practice"}`} className={`h-5 w-5 rounded-full ${DOT[d.state]}`}>
                <span className="sr-only">
                  {dayLabel(d.day)} {d.state}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-small text-slate-500">{view.practice.doneLast30} of 30 days done. Green is the full 10 minutes, yellow part of it, grey none.</p>
        </section>
      )}

      {tab === "classes" && <ChildClasses childId={view.id} upcoming={view.upcoming} recent={view.recent} creditsLabel={view.creditsLabel} openMoveFor={openMoveFor} />}

      {tab === "plan" && (
        <section className="tab-in mt-6 space-y-4" aria-label="Plan">
          {view.plan ? (
            <div className="rounded-2xl bg-neu-base p-5 shadow-raised-low">
              <p className="text-body font-semibold text-slate-50">{view.plan.name}</p>
              <dl className="mt-4 grid gap-3 text-small sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Bills paid</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-100">
                    {view.plan.billsPaid} of {view.plan.billsTotal}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Next bill</dt>
                  <dd className="mt-0.5 text-slate-100">{view.plan.paused ? "Paused" : formatDateTime(view.plan.nextBillOn).replace(/, \d+:\d+ [AP]M$/, "")}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Class credits</dt>
                  <dd className="mt-0.5 text-slate-100">{view.creditsLabel}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Weekly time</dt>
                  <dd className="mt-0.5 text-slate-100">{view.plan.weeklyTime ?? "None (books with credits)"}</dd>
                </div>
              </dl>
              {!view.hasWeeklyTime && (
                <div className="mt-4 rounded-xl bg-neu-base p-3 shadow-pressed-low">
                  <p className="text-small font-semibold text-amber-300">No weekly time yet</p>
                  <p className="mt-0.5 text-small text-slate-400"><Hint>Only classes you book by hand are on the calendar. Set a weekly time and every class in the 28 days is booked at once.</Hint></p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {view.canMoveWeeklyTime && <ChildWeeklyTime childId={view.id} hasTime={view.hasWeeklyTime} />}
                <EndChildPlanButton childId={view.id} />
              </div>
            </div>
          ) : (
            <p className="rounded-2xl bg-neu-base p-5 text-small text-slate-500 shadow-raised-low"><Hint>No plan right now. Start one from the Parent mode page.</Hint></p>
          )}
        </section>
      )}
    </div>
  );
}
