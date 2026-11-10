import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The pieces every card is built from, so each one has the same clear order: what it is (eyebrow), which one (title, the one loud
 * line), the few facts that matter (value first, label under it), one quiet meta line, at most one problem, and the actions at the foot.
 * The rules behind them are in DESIGN.md, "Hierarchy".
 */

type Tone = "default" | "muted" | "success" | "warning" | "danger";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-slate-100",
  muted: "text-slate-400",
  success: "text-emerald-400",
  warning: "text-amber-300",
  danger: "text-red-400",
};

/**
 * A card's head: a small eyebrow naming the kind of thing, the title (the one loud line), an optional quiet subtitle, and at most one
 * status on the right. `title` is the focal point of the card, so nothing else in the card should be this size.
 */
export function CardHead({
  eyebrow,
  title,
  subtitle,
  status,
  as: Heading = "h2",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  as?: "h2" | "h3" | "p";
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-caption font-medium uppercase tracking-caps text-slate-500">{eyebrow}</p>}
        <Heading className={cn("text-title font-semibold text-slate-50 text-balance", eyebrow && "mt-1")}>{title}</Heading>
        {subtitle && <p className="mt-1 text-small text-slate-400">{subtitle}</p>}
      </div>
      {status && <div className="shrink-0 pt-0.5">{status}</div>}
    </div>
  );
}

/** A short set of facts read side by side: two across on a phone, up to four on a computer. Holds `Fact`s. */
export function Facts({ children, className, columns = 4 }: { children: ReactNode; className?: string; columns?: 2 | 3 | 4 }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-4", columns === 3 && "sm:grid-cols-3", columns === 4 && "sm:grid-cols-4", className)}>{children}</dl>
  );
}

/**
 * One fact, value first: the value is what you read (body, medium, bright; one step below the card's title so it never competes with it),
 * the label is a small muted word under it. Labels are a
 * last resort, so keep them to one or two words ("Next bill", "Paid"). The label stays first in the markup (a `dt` must come before
 * its `dd`) and is drawn under the value.
 */
export function Fact({ label, value, tone = "default", className }: { label: ReactNode; value: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col-reverse", className)}>
      <dt className="mt-0.5 text-caption text-slate-500">{label}</dt>
      <dd className={cn("truncate text-body font-medium tabular-nums", VALUE_TONE[tone])}>{value}</dd>
    </div>
  );
}

/** One quiet line of supporting facts, joined with " · ". Empty items are dropped, so callers can pass conditionals. */
export function Meta({ items, className }: { items: (ReactNode | null | undefined | false)[]; className?: string }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false && item !== "");
  if (shown.length === 0) return null;
  return (
    <p className={cn("text-small text-slate-500", className)}>
      {shown.map((item, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden> · </span>}
          {item}
        </span>
      ))}
    </p>
  );
}

const CALLOUT_TONE = {
  warning: "bg-amber-300/10 text-amber-200 ring-amber-300/20",
  danger: "bg-red-400/10 text-red-300 ring-red-400/20",
  neutral: "bg-slate-50/5 text-slate-300 ring-slate-50/10",
} as const;

/**
 * The one thing on a card that needs a person (a late bill, a payment with no record): a tinted strip with one sentence and, if there is
 * one, the action that fixes it. At most one per card, or nothing stands out.
 */
export function Callout({
  tone = "warning",
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONE;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-control px-3 py-2.5 text-small ring-1 ring-inset", CALLOUT_TONE[tone], className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Where a card's actions live: under a hairline, right-aligned. Put at most one primary button here, one or two quiet ones, and
 * everything else (and anything destructive) in a "More" `ActionMenu` as the last item.
 */
export function CardFoot({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-50/8 pt-3", className)}>{children}</div>;
}
