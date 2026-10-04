"use client";

import { useEffect, useState } from "react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { Avatar } from "@/components/messaging/Avatar";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { getFriendsListAction } from "../actions";

interface Friend {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

export function NewGroupPanel({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, memberUsernames: string[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setSelected(new Set());
    setError(null);
    getFriendsListAction().then((rows) => setFriends(rows));
  }, [open]);

  function toggle(username: string | null) {
    if (!username) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  async function handleCreate() {
    if (selected.size === 0) {
      setError("Pick at least one friend.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await onCreate(name, Array.from(selected));
    setSubmitting(false);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
  }

  return (
    <SlideOverPanel open={open} onClose={onClose} title="New group">
      <div className="flex h-full flex-col">
        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-small font-medium text-slate-400">Group name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tizita crew"
              className="h-11 w-full rounded-full border border-(--neu-edge) bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none transition placeholder:text-slate-500 focus:border-signal"
            />
          </div>
          <p className="text-small font-medium text-slate-400">Add friends</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {friends === null ? (
            <p className="text-small text-slate-500">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="text-small text-slate-500">
              You don&apos;t have any friends yet — add some on the Friends page first.
            </p>
          ) : (
            <div className="space-y-1">
              {friends.map((f) => {
                const checked = f.username ? selected.has(f.username) : false;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={!f.username}
                    onClick={() => toggle(f.username)}
                    className={`flex w-full items-center gap-2.5 tap rounded-2xl p-2.5 text-left transition ${
                      checked ? "bg-neu-base shadow-pressed-low" : "hover:shadow-raised-low"
                    } disabled:opacity-40`}
                  >
                    <Avatar image={f.image} label={f.name ?? f.username ?? "?"} className="h-8 w-8 text-small" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small text-slate-100">{f.name ?? `@${f.username}`}</p>
                      {f.username && <p className="truncate text-small text-slate-500">@{f.username}</p>}
                    </div>
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        checked ? "border-transparent bg-signal text-slate-950" : "border-transparent bg-neu-base shadow-pressed-low"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-ink/10 p-4">
          {error && <p className="mb-2 text-small text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || selected.size === 0}
            className="cta-sheen cta-fill flex w-full items-center justify-center rounded-xl py-2.5 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
            {submitting ? "Creating…" : `Create group${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </SlideOverPanel>
  );
}
