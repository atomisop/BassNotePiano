"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAnnouncementRow } from "@/lib/announcements";
import {
  createAnnouncementAction,
  setAnnouncementActiveAction,
  deleteAnnouncementAction,
} from "@/app/(dashboard)/admin/announcements/actions";

function relativeTime(iso: Date): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ComposeForm({ onPublished }: { onPublished: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await createAnnouncementAction(title, body);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setBody("");
    onPublished();
  }

  return (
    <div className="glass-surface p-6">
      <h2 className="font-serif text-lg text-slate-50">New announcement</h2>
      <p className="mt-1 text-sm text-slate-500">
        Publishes instantly — every signed-in user gets a dismissible banner and a notification, no email sent.
      </p>

      <div className="mt-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. New scale added: Bati"
          maxLength={120}
          className="w-full rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          maxLength={1000}
          rows={3}
          className="w-full resize-none rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !title.trim() || !body.trim()}
        className="cta-sheen mt-4 rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Publishing…" : "Publish to everyone"}
      </button>
    </div>
  );
}

function AnnouncementRow({ announcement, totalUsers, onChanged }: { announcement: AdminAnnouncementRow; totalUsers: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleToggleActive() {
    setBusy(true);
    await setAnnouncementActiveAction(announcement.id, !announcement.active);
    setBusy(false);
    onChanged();
  }

  async function handleDelete() {
    if (!confirm("Delete this announcement? This can't be undone.")) return;
    setBusy(true);
    await deleteAnnouncementAction(announcement.id);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-100">{announcement.title}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                announcement.active ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-700/50 text-slate-400"
              }`}
            >
              {announcement.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{announcement.body}</p>
          <p className="mt-2 text-xs text-slate-600">
            {relativeTime(announcement.createdAt)} · {announcement.dismissedCount} of {totalUsers} dismissed
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={busy}
          className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {announcement.active ? "Deactivate" : "Reactivate"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function AnnouncementManager({
  initialAnnouncements,
  totalUsers,
}: {
  initialAnnouncements: AdminAnnouncementRow[];
  totalUsers: number;
}) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ComposeForm onPublished={refresh} />

      <div className="glass-surface p-6">
        <h2 className="font-serif text-lg text-slate-50">History</h2>
        <p className="mt-1 text-sm text-slate-500">Deactivating stops showing it to anyone who hasn't seen it yet — it doesn't recall it from users who already have.</p>

        <div className="mt-4 space-y-3">
          {initialAnnouncements.length === 0 ? (
            <p className="text-sm text-slate-500">No announcements yet.</p>
          ) : (
            initialAnnouncements.map((a) => (
              <AnnouncementRow key={a.id} announcement={a} totalUsers={totalUsers} onChanged={refresh} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
