"use client";

import { OPEN_STUDENT_NOTES, listen } from "@/lib/topBarEvents";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, NotebookPen, Search } from "lucide-react";
import { getTodaysNotesRosterAction, searchStudentsForNotesAction } from "@/app/(dashboard)/admin/users/notes-actions";
import type { NotesRosterRow } from "@/lib/studentNotes";
import type { BookableStudent } from "@/lib/admin";
import { StudentNotesEditor } from "@/components/admin/StudentNotesEditor";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * TopBar panel, owner only, beside Ask AI. Lists the students booked today; tap one to
 * read and write their permanent notes. A student who is not booked today is found with
 * the search box, so their notes are always one search away.
 */
export function StudentNotesPanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [roster, setRoster] = useState<NotesRosterRow[] | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookableStudent[] | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  // The profile menu (the only way in on phones) opens this panel.
  useEffect(() => listen(OPEN_STUDENT_NOTES, () => setOpen(true)), []);

  useEffect(() => {
    if (!open) return;
    getTodaysNotesRosterAction().then(setRoster).catch(() => setRoster([]));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults(null);
    const t = setTimeout(() => searchStudentsForNotesAction(q).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [query]);

  const rowClass = "tap flex w-full items-center gap-2 rounded-lg bg-neu-base p-2.5 text-left shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Student notes"
        title="Student notes"
        aria-expanded={open}
        className={`tap relative flex h-9 w-9 items-center justify-center rounded-lg bg-neu-base transition ${
          open ? "text-signal shadow-pressed-low" : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
        }`}
      >
        <NotebookPen className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Student notes"
            className="fixed right-3 top-12 z-[60] max-h-[80vh] w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-neu-base p-3 shadow-raised-high sm:right-8"
          >
            {selected ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    // Note counts change while writing, so reload the list on the way back.
                    getTodaysNotesRosterAction().then(setRoster).catch(() => undefined);
                  }}
                  className="tap inline-flex items-center gap-1.5 text-small font-medium text-slate-400 hover:text-slate-100"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <p className="mb-3 mt-1 px-1 text-body font-semibold text-slate-100">{selected.name}</p>
                <StudentNotesEditor studentId={selected.id} />
              </>
            ) : (
              <>
                <p className="px-1 text-body font-semibold text-slate-100">Student notes</p>
                <p className="px-1 text-small text-slate-500">Booked today</p>
                <div className="mt-2 space-y-1.5">
                  {roster === null ? (
                    <PulsatingDots className="justify-start px-1" />
                  ) : roster.length === 0 ? (
                    <p className="px-1 text-small text-slate-500">Nobody is booked today. Search for a student below.</p>
                  ) : (
                    roster.map((r) => (
                      <button key={r.studentId} type="button" onClick={() => setSelected({ id: r.studentId, name: r.name ?? r.email })} className={rowClass}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-small font-medium text-slate-100">{r.name ?? r.email}</span>
                          <span className="block truncate text-small text-slate-500">{r.times.map(timeOf).join(", ")}</span>
                        </span>
                        <span className="shrink-0 text-small text-slate-500">{r.noteCount} note{r.noteCount === 1 ? "" : "s"}</span>
                      </button>
                    ))
                  )}
                </div>

                <p className="mt-4 px-1 text-small text-slate-500">Anyone else</p>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or email"
                    aria-label="Search students"
                    className="w-full rounded-lg bg-neu-base py-2 pl-8 pr-2 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500"
                  />
                </div>
                {results && (
                  <div className="mt-2 space-y-1.5">
                    {results.length === 0 ? (
                      <p className="px-1 text-small text-slate-500">No match.</p>
                    ) : (
                      results.map((s) => (
                        <button key={s.id} type="button" onClick={() => setSelected({ id: s.id, name: s.name ?? s.email })} className={rowClass}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-small font-medium text-slate-100">{s.name ?? s.email}</span>
                            <span className="block truncate text-small text-slate-500">{s.email}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
