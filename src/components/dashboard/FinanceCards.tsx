import Link from "next/link";
import { ArrowRight } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The left column of the finance mockup, in our palette (black, orange, white, grey): a hero card with one bright pill and one quiet
// one, a row of three small stat cards, a thick progress bar, and a dark card beside an orange one. Plain, presentational pieces: the
// screen decides what goes in them. Used by Home, and by the admin Overview with money in place of learning.

export interface Action {
  href: string;
  label: string;
  /** Opens in a new tab (a Discord call, a file). */
  external?: boolean;
}

/** A small round-cornered chip: a status or a change, e.g. "Scale 1" or "+8% this month". */
export function Chip({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "orange" | "dark" | "up" | "down"; className?: string }) {
  const tones = {
    neutral: "bg-slate-50/8 text-slate-300",
    orange: "bg-signal/16 text-signal-fg",
    dark: "bg-white/15 text-white",
    up: "bg-signal/16 text-signal-fg",
    down: "bg-slate-50/8 text-slate-300",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-small font-medium tabular-nums", tones[tone], className)}>{children}</span>;
}

/** The big card: what matters most, a headline, and one bright pill with one quiet one beside it. */
export function HeroCard({
  eyebrow,
  title,
  detail,
  chip,
  primary,
  secondary,
  primaryQuiet = false,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  chip?: React.ReactNode;
  primary: Action;
  secondary?: Action;
  /** Show the main button in the quiet style (used while another action, like joining a class, takes the spotlight). */
  primaryQuiet?: boolean;
}) {
  return (
    <section className="rounded-3xl bg-neu-base p-5 shadow-(--plane-mid-shadow) sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-small text-slate-400">{eyebrow}</p>
        {chip}
      </div>
      <h2 className="mt-2 text-balance font-hero text-[clamp(1.5rem,1.1rem+1.2vw,2.25rem)] font-bold leading-tight tracking-tight text-slate-50">{title}</h2>
      {detail && <p className="mt-1.5 max-w-[60ch] text-small text-slate-400">{detail}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:flex">
        <Link href={primary.href} className={cn(buttonVariants({ variant: primaryQuiet ? "secondary" : "default", size: "lg" }), "justify-center sm:min-w-40")}>
          {primary.label}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
        {secondary && (
          <Link href={secondary.href} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "justify-center sm:min-w-40")}>
            {secondary.label}
          </Link>
        )}
      </div>
    </section>
  );
}

/** Three small cards in a row under the hero (like the wallets): a label, a number, one word of status. */
export function MiniStats({ title, note, items }: { title: string; note?: string; items: { label: string; value: string; status: string; on?: boolean }[] }) {
  return (
    <section className="rounded-3xl bg-neu-base shadow-raised-mid p-4">
      <p className="mb-3 text-small text-slate-400">
        <span className="font-medium text-slate-100">{title}</span>
        {note && <span className="text-slate-500"> | {note}</span>}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-2xl bg-neu-base shadow-pressed-low p-3">
            <p className="text-small text-slate-400">{it.label}</p>
            <p className="mt-1 text-body font-semibold tabular-nums text-slate-50">{it.value}</p>
            <p className={cn("mt-1 flex items-center gap-1.5 text-caption", it.on ? "text-signal-fg" : "text-slate-500")}>
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", it.on ? "bg-signal" : "bg-slate-500")} />
              {it.status}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** A thick progress bar with its title, what has been done on the left and the goal on the right (the spending limit card). */
export function LimitCard({ title, done, goal, fraction, label }: { title: string; done: string; goal: string; fraction: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return (
    <section className="rounded-3xl bg-neu-base shadow-raised-mid p-5">
      <p className="text-small font-medium text-slate-100">{title}</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-50/8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <div className="h-full w-full rounded-full bg-signal transition-transform duration-(--dur-slow) ease-(--ease-ios)" style={{ transform: `translateX(${pct - 100}%)` }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between text-small tabular-nums">
        <span className="text-slate-300">{done}</span>
        <span className="text-slate-500">{goal}</span>
      </div>
    </section>
  );
}

/** One of the two showcase cards: the dark one and the orange one. */
export function ShowCard({
  tone,
  title,
  chip,
  big,
  sub,
  action,
}: {
  tone: "dark" | "orange";
  title: string;
  chip: string;
  big: string;
  sub?: string;
  action?: Action;
}) {
  return (
    <div
      className={cn(
        "flex min-h-44 flex-col justify-between rounded-3xl p-5 text-white shadow-(--plane-mid-shadow)",
        tone === "dark" ? "bg-[linear-gradient(135deg,rgb(44_44_46),rgb(12_12_12))]" : "bg-[linear-gradient(135deg,rgb(70_30_8),rgb(214_92_44))]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-small font-medium text-white/80">{title}</p>
        <Chip tone="dark">{chip}</Chip>
      </div>
      <div>
        <p className="text-balance text-body font-semibold leading-snug sm:text-title">{big}</p>
        {sub && <p className="mt-1 text-small text-white/70">{sub}</p>}
        {action &&
          (action.external ? (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tap mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-small font-semibold text-black hover:bg-white/90"
            >
              {action.label}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : (
            <Link href={action.href} className="tap mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-small font-semibold text-white hover:bg-white/25">
              {action.label}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          ))}
      </div>
    </div>
  );
}

/**
 * One sideways card with a few short facts next to each other (next class, credits, today's practice), each a label, one big
 * value and one line or action. Raised like the other cards; the facts are separated by pressed-in dividers, and a progress
 * item shows a pressed-in track.
 */
export function StatusStrip({
  items,
}: {
  items: {
    label: string;
    value: string;
    sub?: string;
    action?: Action;
    /** 0 to 1: draws a progress track under the value. */
    fraction?: number;
  }[];
}) {
  return (
    <section className="grid grid-cols-1 overflow-hidden rounded-3xl bg-neu-base shadow-raised-mid sm:grid-cols-3">
      {items.map((it, i) => (
        <div key={it.label} className={cn("flex min-w-0 flex-col justify-between gap-2 p-4 sm:p-5", i > 0 && "border-t border-(--neu-edge) sm:border-l sm:border-t-0")}>
          <div className="min-w-0">
            <p className="text-small text-slate-400">{it.label}</p>
            <p className="mt-1 truncate text-body font-semibold text-slate-50 sm:text-title">{it.value}</p>
            {it.fraction !== undefined && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-neu-base shadow-pressed-low" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, it.fraction) * 100)} aria-label={it.label}>
                <div className="h-full w-full rounded-full bg-signal transition-transform duration-(--dur-slow) ease-(--ease-ios)" style={{ transform: `translateX(${Math.max(0, Math.min(100, Math.round(it.fraction * 100))) - 100}%)` }} />
              </div>
            )}
            {it.sub && <p className="mt-1.5 truncate text-small text-slate-500">{it.sub}</p>}
          </div>
          {it.action &&
            (it.action.external ? (
              <a href={it.action.href} target="_blank" rel="noopener noreferrer" className="tap inline-flex w-fit items-center gap-1 rounded-full bg-neu-base px-3 py-1 text-small font-semibold text-slate-100 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low">
                {it.action.label}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </a>
            ) : (
              <Link href={it.action.href} className="tap inline-flex w-fit items-center gap-1 rounded-full bg-neu-base px-3 py-1 text-small font-semibold text-slate-100 shadow-raised-low transition hover:shadow-raised-mid active:shadow-pressed-low">
                {it.action.label}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            ))}
        </div>
      ))}
    </section>
  );
}
