"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminListSearch, matchesQuery } from "@/components/admin/AdminListSearch";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { ViewMore } from "@/components/ui/ViewMore";
import { EmptyState } from "@/components/ui/EmptyState";
import { Search } from "@/components/ui/appIcons";
import { toast } from "@/components/ui/Toaster";

export interface DiscordMemberRow {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  banned: boolean;
  /** The Discord name they connected, or null when they have not connected. */
  discordUsername: string | null;
}

type Show = "ALL" | "CONNECTED" | "NOT_CONNECTED";

/** Everyone, with whether they have connected Discord. The first press on Disconnect asks, the second does it. */
export function DiscordMembersList({
  rows,
  onDisconnect,
  onNotify,
}: {
  rows: DiscordMemberRow[];
  onDisconnect: (userId: string, notify?: boolean) => Promise<{ ok: boolean; message: string }>;
  /** Tells this person to connect Discord, with the steps. */
  onNotify: (userId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("ALL");
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tellStudent, setTellStudent] = useNotifyStudent("discord");
  const [notifying, setNotifying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const connected = rows.filter((r) => r.discordUsername).length;
  const visible = rows
    .filter((r) => (show === "CONNECTED" ? r.discordUsername : show === "NOT_CONNECTED" ? !r.discordUsername : true))
    .filter((r) => matchesQuery({ n: r.name, e: r.email, d: r.discordUsername }, query));

  async function disconnect(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      const hold = await toast.held("Disconnecting their Discord", () => onDisconnect(id, tellStudent), { mail: tellStudent });
      if (hold.undone) return;
      const res = hold.value;
      setNotice({ ok: res.ok, text: res.message });
      router.refresh();
    } catch {
      setNotice({ ok: false, text: "That didn't go through. Please try again." });
    } finally {
      setBusy(null);
      setAsking(null);
    }
  }

  async function notify(id: string) {
    setNotifying(id);
    setNotice(null);
    try {
      const hold = await toast.held("Sending the Discord message", () => onNotify(id), { mail: true });
      if (hold.undone) return;
      const res = hold.value;
      setNotice({ ok: res.ok, text: res.message });
    } catch {
      setNotice({ ok: false, text: "That didn't go through. Please try again." });
    } finally {
      setNotifying(null);
    }
  }

  const tabs: { label: string; value: Show }[] = [
    { label: `Everyone (${rows.length})`, value: "ALL" },
    { label: `Connected (${connected})`, value: "CONNECTED" },
    { label: `Not connected (${rows.length - connected})`, value: "NOT_CONNECTED" },
  ];

  return (
    <div>
      <NotifyToggle on={tellStudent} onChange={setTellStudent} label="Notify the student when I disconnect them" className="mb-3" />
      <div role="group" aria-label="Show" className="mb-4 flex w-fit max-w-full flex-wrap gap-1.5 rounded-full p-1 bg-neu-base shadow-pressed-low">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setShow(t.value)}
            aria-pressed={show === t.value}
            className={`tap rounded-full px-3 py-1.5 text-small font-medium ${show === t.value ? "bg-neu-base text-slate-50 shadow-raised-low" : "text-slate-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminListSearch value={query} onChange={setQuery} placeholder="Search a name, email or Discord name" shown={visible.length} total={rows.length} />

      {notice && (
        <p role="status" className={`mb-3 text-small ${notice.ok ? "text-slate-300" : "text-red-400"}`}>
          {notice.text}
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={<Search />} title="No one found" description="Try another name, email or Discord name." />
      ) : (
        <ul className="glass-surface divide-y divide-slate-50/10 px-4">
          <ViewMore items={visible} initial={15} step={20}>
          {(row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-slate-50">
                  {row.name ?? row.email}
                  {row.isAdmin && <span className="ml-2 text-small text-slate-400">Admin</span>}
                </p>
                {row.name && <p className="truncate text-small text-slate-500">{row.email}</p>}
              </div>

              {row.discordUsername ? (
                <>
                  <span className="shrink-0 text-small text-slate-300">
                    <span className="text-slate-500">Connected as </span>
                    {row.discordUsername}
                  </span>
                  {asking === row.id ? (
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setAsking(null)} disabled={busy === row.id} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Not yet
                      </button>
                      <button type="button" onClick={() => disconnect(row.id)} disabled={busy === row.id} className={buttonVariants({ variant: "danger", size: "sm" })}>
                        {busy === row.id && <MorphingSquare size={12} />}
                        {busy === row.id ? "Working…" : "Yes, disconnect"}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setAsking(row.id)} className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}>
                      Disconnect
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="shrink-0 text-small text-slate-500">Not connected</span>
                  {!row.banned && (
                    <button
                      type="button"
                      onClick={() => notify(row.id)}
                      disabled={notifying === row.id}
                      className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                    >
                      {notifying === row.id && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      {notifying === row.id ? "Sending…" : "Notify"}
                    </button>
                  )}
                </>
              )}
            </li>
          )}
          </ViewMore>
        </ul>
      )}
    </div>
  );
}
