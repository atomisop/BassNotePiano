"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus } from "@/components/ui/appIcons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { ROADMAP_ARTWORKS, ROADMAP_INSTRUMENTS, ROADMAP_LEVELS } from "@/lib/roadmapRules";
import { RoadmapArtwork } from "@/components/home/RoadmapArtwork";
import { addScaleAction, createRoadmapAction, moveRoadmapAction, moveScaleAction, updateRoadmapAction } from "@/app/(dashboard)/admin/roadmaps/actions";
import { cn } from "@/lib/utils";
import { IconSwap } from "@/components/ui/IconSwap";
import { StatusDot } from "@/components/ui/StatusDot";
import { Meta } from "@/components/ui/CardKit";

const field =
  "h-11 w-full min-w-0 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

type AdminScale = { id: string; slug: string; code: string; title: string; lessons: number };
export type AdminRoadmap = {
  id: string;
  name: string;
  description: string | null;
  instrument: string | null;
  level: string | null;
  artwork: string;
  visible: boolean;
  scales: AdminScale[];
};

type Result = { ok: true } | { ok: false; error: string };

/** Runs one admin action, refreshes the page on success and keeps the error to show. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (work: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await work();
      if (!res.ok) return setError(res.error);
      after?.();
      router.refresh();
    });
  return { pending, error, run };
}

export function RoadmapsAdmin({ roadmaps }: { roadmaps: AdminRoadmap[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="grid gap-4">
      {roadmaps.map((r, i) => (
        <RoadmapCard key={r.id} roadmap={r} first={i === 0} last={i === roadmaps.length - 1} />
      ))}
      {adding ? (
        <Card className="min-w-0 p-4 md:p-5">
          <p className="text-body font-semibold text-slate-50">New roadmap</p>
          <RoadmapForm onDone={() => setAdding(false)} />
        </Card>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="h-4 w-4" />
            New roadmap
          </Button>
        </div>
      )}
    </div>
  );
}

function RoadmapCard({ roadmap: r, first, last }: { roadmap: AdminRoadmap; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [addingScale, setAddingScale] = useState(false);
  const { pending, error, run } = useAction();
  const meta = [r.level, r.instrument ?? "Any instrument"].filter(Boolean).join(" · ");

  return (
    <Card className="min-w-0 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <RoadmapArtwork artwork={r.artwork} className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* The roadmap's name is the card's one loud line. Shown to students is the normal state, so only Hidden gets a status. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-title font-semibold text-slate-50">{r.name}</p>
            {!r.visible && <StatusDot tone="warning">Hidden</StatusDot>}
          </div>
          <Meta className="mt-0.5" items={[meta, `${r.scales.length} scale${r.scales.length === 1 ? "" : "s"}`]} />
          {r.description && <p className="mt-1 text-small text-slate-400">{r.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Move up" disabled={first || pending} onClick={() => run(() => moveRoadmapAction(r.id, "up"))}>
            <ArrowUp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Move down" disabled={last || pending} onClick={() => run(() => moveRoadmapAction(r.id, "down"))}>
            <ArrowDown className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={r.visible ? "ghost" : "secondary"}
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              updateRoadmapAction(r.id, { name: r.name, description: r.description ?? "", instrument: r.instrument ?? "", level: r.level ?? "", artwork: r.artwork, visible: !r.visible }),
            )
          }
        >
          <IconSwap state={r.visible}>{r.visible ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}</IconSwap>
          {r.visible ? "Hide from students" : "Show to students"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
          <Pencil aria-hidden className="h-4 w-4" />
          {editing ? "Close" : "Edit"}
        </Button>
      </div>
      {error && <p className="mt-2 text-small text-red-300">{error}</p>}
      {editing && <RoadmapForm roadmap={r} onDone={() => setEditing(false)} />}

      {/* The scales as plain rows under a hairline, not a stack of wells: the title is what you read, the code and count are quiet. */}
      <ol className="mt-4 divide-y divide-slate-50/8 border-t border-slate-50/8">
        {r.scales.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold text-slate-100">
                <span className="font-medium text-slate-500">{s.code}</span> {s.title}
              </span>
              <span className="block text-caption text-slate-500">
                {s.lessons} lesson{s.lessons === 1 ? "" : "s"}
              </span>
            </span>
            <IconButton label={`Move ${s.title} up`} disabled={i === 0 || pending} onClick={() => run(() => moveScaleAction(s.id, "up"))}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label={`Move ${s.title} down`} disabled={i === r.scales.length - 1 || pending} onClick={() => run(() => moveScaleAction(s.id, "down"))}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
          </li>
        ))}
        {r.scales.length === 0 && <li className="py-2 text-small text-slate-500">No scales yet.</li>}
      </ol>

      {addingScale ? (
        <ScaleForm roadmapId={r.id} nextCode={`Scale ${r.scales.length + 1}`} onDone={() => setAddingScale(false)} />
      ) : (
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setAddingScale(true)}>
          <Plus aria-hidden className="h-4 w-4" />
          Add a scale
        </Button>
      )}
    </Card>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="tap flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-neu-base hover:text-slate-50 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RoadmapForm({ roadmap, onDone }: { roadmap?: AdminRoadmap; onDone: () => void }) {
  const [name, setName] = useState(roadmap?.name ?? "");
  const [description, setDescription] = useState(roadmap?.description ?? "");
  const [instrument, setInstrument] = useState(roadmap?.instrument ?? "");
  const [level, setLevel] = useState(roadmap?.level ?? "");
  const [artwork, setArtwork] = useState(roadmap?.artwork ?? "dusk");
  const { pending, error, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { name, description, instrument, level, artwork };
    run(() => (roadmap ? updateRoadmapAction(roadmap.id, { ...input, visible: roadmap.visible }) : createRoadmapAction(input)), onDone);
  };

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3">
      <label className="grid gap-1.5 text-small text-slate-300">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} placeholder="Beginner Piano" />
      </label>
      <label className="grid gap-1.5 text-small text-slate-300">
        One line about it (optional)
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className={field} placeholder="Your first songs and the keys under your fingers." />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-small text-slate-300">
          Instrument
          <select value={instrument} onChange={(e) => setInstrument(e.target.value)} className={field}>
            <option value="">Any instrument</option>
            {ROADMAP_INSTRUMENTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-small text-slate-300">
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={field}>
            <option value="">No level</option>
            {ROADMAP_LEVELS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="text-small text-slate-300">Picture</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {Object.entries(ROADMAP_ARTWORKS).map(([key, a]) => (
            <button
              key={key}
              type="button"
              aria-pressed={artwork === key}
              onClick={() => setArtwork(key)}
              className={cn("tap flex flex-col items-center gap-1 rounded-xl p-1.5 text-caption text-slate-300", artwork === key && "ring-2 ring-signal")}
            >
              <RoadmapArtwork artwork={key} className="h-10 w-14" />
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-small text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {roadmap ? "Save" : "Add roadmap"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ScaleForm({ roadmapId, nextCode, onDone }: { roadmapId: string; nextCode: string; onDone: () => void }) {
  const [code, setCode] = useState(nextCode);
  const [title, setTitle] = useState("");
  const [formula, setFormula] = useState("");
  const [description, setDescription] = useState("");
  const { pending, error, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addScaleAction(roadmapId, { code, title, formula, description }), onDone);
      }}
      className="mt-3 grid gap-3 rounded-xl bg-neu-base p-3 shadow-pressed-low"
    >
      <p className="text-small font-semibold text-slate-100">New scale (goes at the end of this roadmap)</p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="grid gap-1.5 text-small text-slate-300">
          Label
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} className={field} />
        </label>
        <label className="grid gap-1.5 text-small text-slate-300">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={field} placeholder="The Dorian Mode" />
        </label>
      </div>
      <label className="grid gap-1.5 text-small text-slate-300">
        Formula
        <input value={formula} onChange={(e) => setFormula(e.target.value)} maxLength={60} className={field} placeholder="1-2-b3-4-5-6-b7" />
      </label>
      <label className="grid gap-1.5 text-small text-slate-300">
        About it (optional)
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className={field} />
      </label>
      {error && <p className="text-small text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Add scale
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
