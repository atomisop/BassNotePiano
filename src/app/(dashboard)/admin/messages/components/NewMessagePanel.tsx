"use client";

import { useEffect, useState } from "react";
import { SlideOverPanel } from "@/components/layout/SlideOverPanel";
import { Avatar } from "@/components/messaging/Avatar";
import { searchMessageableUsersAction } from "../actions";
import type { MessageableUser } from "@/lib/messages";

const SEARCH_DEBOUNCE_MS = 250;

/** Search-by-name-or-email picker — deliberately not username-based, since a user doesn't need one to be reachable here (unlike the friend system's NewGroupPanel). */
export function NewMessagePanel({
  open,
  onClose,
  onSelectUser,
}: {
  open: boolean;
  onClose: () => void;
  onSelectUser: (user: MessageableUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageableUser[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    // Empty query still returns the most-recent users, so there's something to pick from immediately.
    searchMessageableUsersAction("").then(setResults);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      searchMessageableUsersAction(query).then(setResults);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, open]);

  function handleSelect(user: MessageableUser) {
    onSelectUser(user);
    onClose();
  }

  return (
    <SlideOverPanel open={open} onClose={onClose} title="New message">
      <div className="flex h-full flex-col">
        <div className="p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-ink/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {results === null ? (
            <p className="text-xs text-slate-600">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-slate-600">No users found.</p>
          ) : (
            <div className="space-y-1">
              {results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelect(u)}
                  className="flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left transition hover:bg-ink/5"
                >
                  <Avatar image={u.image} label={u.name ?? u.email} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-100">{u.name ?? "Unnamed"}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </SlideOverPanel>
  );
}
