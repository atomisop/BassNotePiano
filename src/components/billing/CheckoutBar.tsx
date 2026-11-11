"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * The price and the next step, as the last card on the plan form: everything above it is filled in first, then Review is the one thing
 * left to press. When something is still missing the button looks off, and pressing it says what in a small popup.
 */
export function CheckoutBar(props: {
  priceCents: number;
  /** After the price, e.g. "first payment" or "every 28 days". */
  priceNote: string;
  /** The whole plan's price, shown under the detail for a plan of more than one bill. */
  total?: string | null;
  /** What is still missing. The button looks off, and pressing it says this in a small popup instead of a sentence on the card. */
  hint: string | null;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div data-summary>
      <Bar {...props} />
    </div>
  );
}

function Bar({ priceCents, priceNote, total, hint, actionLabel, onAction }: { priceCents: number; priceNote: string; total?: string | null; hint: string | null; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-neu-base p-4 shadow-raised-mid md:gap-6 md:px-6 md:py-5">
      <div className="min-w-0 flex-1" aria-live="polite">
        {/* The price is the focal figure of the whole form: the biggest number on it, with what it covers small under it. */}
        <p className="leading-tight">
          <span className="block text-headline font-semibold tabular-nums text-slate-50">
            <NumberTicker value={priceCents} format={usd} />
          </span>
          <span className="mt-0.5 block text-small text-slate-400">{priceNote}</span>
        </p>
        {total && <p className="mt-1 text-caption leading-snug text-slate-500">{total}</p>}
      </div>
      {/* Looks off while something is missing, but stays pressable: the press explains what is missing in a popup. */}
      <button
        type="button"
        aria-disabled={hint !== null}
        onClick={() => {
          if (hint !== null) {
            toast.warning(hint);
            return;
          }
          onAction();
        }}
        className={buttonVariants({ variant: "primary", size: "lg", className: cn("shrink-0 md:min-w-40", hint !== null && "cursor-not-allowed") })}
      >
        {actionLabel}
      </button>
    </div>
  );
}
