import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * #8 — The table primitive.
 *
 * shadcn's table, re-tokenised: the upstream version uses `border-border`,
 * `bg-muted/50` and `text-muted-foreground`, which resolve through the bridge
 * in globals.css but land heavier than this design system's hairlines. These
 * use `ink/N` borders and the slate ramp directly, matching every other
 * surface in the app.
 *
 * The wrapper's `overflow-x-auto` is what keeps a wide table from pushing the
 * page sideways at 375px — the table scrolls inside its own box instead.
 */

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-ink/10", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-ink/5 transition-colors hover:bg-[rgb(var(--c-s-50))]/[0.04] data-[state=selected]:bg-[rgb(var(--c-s-50))]/[0.06]",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 whitespace-nowrap px-3 text-left align-middle text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("px-3 py-3 align-middle text-slate-300", className)} {...props} />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-3 text-xs text-slate-500", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
