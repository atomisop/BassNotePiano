"use client";

import { useEffect, useState } from "react";
import { PulsatingDots } from "@/components/ui/pulsating-loader";
import { EyeOff, Eye, Pencil, Trash2 } from "@/components/ui/appIcons";
import { deleteStudentNoteAction, listStudentNotesAction, saveStudentNoteAction } from "@/app/(dashboard)/admin/users/notes-actions";
import type { StudentNoteRow } from "@/lib/studentNotes";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { InlineConfirm } from "@/components/admin/InlineConfirm";
import { toast } from "@/components/ui/Toaster";
import { IconSwap } from "@/components/ui/IconSwap";
import { Meta } from "@/components/ui/CardKit";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/**
 * One student's permanent notes: add, edit, delete, and mark each one "Hide from
 * student". The same editor sits in the top bar's Student Notes panel and on the
 * student's admin page, so notes written in one place show in the other.
 */
export function StudentNotesEditor({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<StudentNoteRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [hidden, setHidden] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setNotes(null);
    setDraft("");
    setEditingId(null);
    setError(null);
    listStudentNotesAction(studentId).then((r) => {
      if (!live) return;
      if (r.ok) setNotes(r.notes);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [studentId]);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveStudentNoteAction(studentId, editingId, draft, hidden);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNotes((prev) => (editingId ? (prev ?? []).map((n) => (n.id === r.note.id ? r.note : n)) : [r.note, ...(prev ?? [])]));
    setDraft("");
    setHidden(false);
    setEditingId(null);
  }

  async function toggleHidden(n: StudentNoteRow) {
    const r = await saveStudentNoteAction(studentId, n.id, n.body, !n.hiddenFromStudent);
    if (r.ok) setNotes((prev) => (prev ?? []).map((x) => (x.id === n.id ? r.note : x)));
    else setError(r.error);
  }

  function remove(id: string) {
    const gone = (notes ?? []).find((n) => n.id === id);
    setConfirmingDelete(null);
    if (!gone) return;
    // Hidden at once; the real delete waits 5 seconds so Undo can still cancel it.
    setNotes((prev) => (prev ?? []).filter((n) => n.id !== id));
    toast.deferred(
      "Note deleted",
      async () => {
        const r = await deleteStudentNoteAction(id);
        if (!r.ok) {
          setNotes((prev) => [gone, ...(prev ?? [])]);
          setError(r.error);
        }
      },
      () => setNotes((prev) => [gone, ...(prev ?? [])].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))),
    );
  }

  return (
    <div>
      <div className="rounded-xl bg-neu-base p-2.5 shadow-pressed-low">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder={editingId ? "Update this note" : "Write a note: progress, what to work on next"}
          aria-label="Note"
          className="w-full resize-y rounded-lg bg-transparent p-1.5 text-body text-slate-100 outline-none placeholder:text-slate-500"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <label className="tap inline-flex cursor-pointer items-center gap-2 text-small text-slate-300">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-4 w-4 accent-signal" />
            Hide from student
          </label>
          <div className="flex gap-1.5">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft("");
                  setHidden(false);
                }}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={busy || !draft.trim()}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              {busy && <MorphingSquare size={11} />}
              {editingId ? "Save changes" : "Save note"}
            </button>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-small text-red-400">{error}</p>}

      {/* Notes as rows: the note itself is what you read, the date and who can see it one quiet line, the tools small on the right. */}
      <div className="mt-3">
        {notes === null ? (
          <PulsatingDots className="justify-start" />
        ) : notes.length === 0 ? (
          <p className="text-small text-slate-500">No notes yet.</p>
        ) : (
          <div className="divide-y divide-slate-50/6">
            {notes.map((n) => (
              <div key={n.id} className="py-3">
                <p className="whitespace-pre-wrap text-body text-slate-100">{n.body}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Meta
                    items={[
                      `${when(n.createdAt)}${n.updatedAt !== n.createdAt && when(n.updatedAt) !== when(n.createdAt) ? `, edited ${when(n.updatedAt)}` : ""}`,
                      n.hiddenFromStudent ? "Private" : "Student can see",
                    ]}
                  />
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => toggleHidden(n)}
                      aria-label={n.hiddenFromStudent ? "Show to student" : "Hide from student"}
                      title={n.hiddenFromStudent ? "Show to student" : "Hide from student"}
                      className="tap flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100"
                    >
                      <IconSwap state={n.hiddenFromStudent}>{n.hiddenFromStudent ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</IconSwap>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(n.id);
                        setDraft(n.body);
                        setHidden(n.hiddenFromStudent);
                      }}
                      aria-label="Edit note"
                      title="Edit note"
                      className="tap flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete((cur) => (cur === n.id ? null : n.id))}
                      aria-expanded={confirmingDelete === n.id}
                      aria-label="Delete note"
                      title="Delete note"
                      className="tap flex h-8 w-8 items-center justify-center rounded-lg text-red-300/80 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                {confirmingDelete === n.id && (
                  <InlineConfirm
                    className="mt-3"
                    danger
                    question="Delete this note for good?"
                    confirmLabel="Yes, delete it"
                    busyLabel="Deleting…"
                    busy={false}
                    onCancel={() => setConfirmingDelete(null)}
                    onConfirm={() => void remove(n.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
