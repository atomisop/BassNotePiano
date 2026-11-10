"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Send, ShieldCheck } from "@/components/ui/appIcons";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { formatDateTime } from "@/lib/classScheduleLabels";
import { askParentAboutClassAction, classesToAskAboutAction } from "@/app/(dashboard)/parent/actions";
import type { ParentAskClass } from "@/lib/parentAsk";

/**
 * A child whose parent controls the schedule sees the screen with every button switched off and a plain line on top. The server refuses
 * the same actions too (see hasParentControl), so this is only the honest face of it. Above it, each class still to come has "Ask my
 * parent to move or skip this", which sends the parent a notice that opens that class's move picker, so the child is never stuck.
 */
export function ParentLockedArea({ locked, children }: { locked: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop; the attribute switches off focus, clicks and screen readers for everything inside.
  useEffect(() => {
    ref.current?.toggleAttribute("inert", locked);
  }, [locked, children]);
  if (!locked) return <>{children}</>;
  return (
    <>
      <p role="status" className="mb-4 flex items-center gap-2.5 rounded-xl bg-neu-base px-4 py-3 text-small font-medium text-slate-100 shadow-raised-low">
        <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-signal-fg" />
        Your schedule is controlled by your parent.
      </p>
      <AskParentList />
      <div ref={ref} aria-disabled className="pointer-events-none select-none opacity-60">
        {children}
      </div>
    </>
  );
}

/** The child's classes still to come, each with one button that asks their parent to move or skip it. */
function AskParentList() {
  const [classes, setClasses] = useState<ParentAskClass[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    classesToAskAboutAction()
      .then((r) => alive && setClasses(r.classes))
      .catch(() => alive && setClasses([]));
    return () => {
      alive = false;
    };
  }, []);

  async function ask(id: string) {
    setBusy(id);
    const result = await askParentAboutClassAction(id).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return void toast.warning(result.error);
    setClasses((prev) => prev?.map((c) => (c.id === id ? { ...c, asked: true } : c)) ?? prev);
    toast.success(result.already ? "Your parent already has this request" : "Asked. Your parent got a notice to move or skip it.");
  }

  if (classes === null) {
    return (
      <div role="status" className="mb-5 flex justify-center py-3">
        <MorphingSquare size={16} />
        <span className="sr-only">Loading your classes</span>
      </div>
    );
  }
  if (classes.length === 0) return null;

  return (
    <section aria-label="Your next classes" className="mb-6">
      <h2 className="text-title font-semibold text-slate-50">Your next classes</h2>
      <p className="mt-1 text-small text-slate-400">Need another time or a week off? Ask your parent and they can move or skip it for you.</p>
      <ul className="mt-3 space-y-2">
        {classes.map((c) => (
          <li key={c.id} className="flex flex-col gap-3 rounded-2xl bg-neu-base p-4 shadow-raised-low sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-small font-medium text-slate-100">{formatDateTime(c.scheduledAt)}</p>
              {c.label && <p className="mt-0.5 truncate text-small text-slate-500">{c.label}</p>}
            </div>
            {c.asked ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-small font-medium text-emerald-400">
                <Check aria-hidden className="h-4 w-4" />
                Your parent was asked
              </span>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void ask(c.id)}
                className={buttonVariants({ variant: "secondary", size: "sm", className: "h-auto min-h-9 w-full whitespace-normal py-2 text-center sm:w-auto" })}
              >
                {busy === c.id ? <MorphingSquare size={12} className="shrink-0" /> : <Send aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                Ask my parent to move or skip this
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
