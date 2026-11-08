"use client";

import { GlassLens } from "@/components/ui/GlassLens";
import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Search } from "@/components/ui/appIcons";

/**
 * #3, Command primitive (cmdk), re-tokenised.
 *
 * Uses `bg-surface` (the opaque chrome surface) rather than the ground: this
 * floats over page content, and a translucent or ground-coloured panel would
 * let the page read through it. Same reasoning as the nav dropdowns.
 */

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn("flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface", className)}
    {...props}
  />
));
Command.displayName = "Command";

function CommandDialog({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The window grows a little out of the button that was pressed (opened from the keyboard it does not animate at all, see globals.css):
  // the moment the panel is attached (before it is painted), work out how far, and which way, that button is from where the panel
  // sits, and hand it to the CSS as the transform-origin.
  const place = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const trigger = Array.from(document.querySelectorAll<HTMLElement>("[data-search-trigger]")).find((t) => t.getBoundingClientRect().width > 0);
    const rect = trigger?.getBoundingClientRect();
    const fromX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const fromY = rect ? rect.top + rect.height / 2 : window.innerHeight - 36;
    el.style.setProperty("--cmd-dx", `${Math.round(fromX - window.innerWidth / 2)}px`);
    el.style.setProperty("--cmd-dy", `${Math.round(fromY - (el.offsetTop + el.offsetHeight / 2))}px`);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cmd-scrim fixed inset-0 z-50" />
        <DialogPrimitive.Content
          ref={place}
          className="cmd-window fixed left-1/2 top-[18%] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 rounded-[1.25rem] p-0 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]"
          aria-label="Command menu"
        >
          <GlassLens surface radius={20} bezel={18} strength={12} blur={18} tint="var(--lg-sheet-tint)" className="-z-10" />
          {/* Radix requires a title for screen readers; it's visually hidden
              because the search field already labels the dialog on screen. */}
          <DialogPrimitive.Title className="sr-only">Search and jump to</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to search scales and pages, then press Enter.
          </DialogPrimitive.Description>
          <Command className="!bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-small [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-caps [&_[cmdk-group-heading]]:text-slate-500">
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-ink/10 px-3">
    <Search className="shrink-0 text-slate-500" size={16} />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-12 w-full bg-transparent text-small text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[60vh] overflow-y-auto overflow-x-hidden p-1.5", className)}
    {...props}
  />
));
CommandList.displayName = "CommandList";

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-8 text-center text-small text-slate-500"
    {...props}
  />
));
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group ref={ref} className={cn("overflow-hidden", className)} {...props} />
));
CommandGroup.displayName = "CommandGroup";

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-small text-slate-300 outline-none transition-colors data-[selected=true]:bg-slate-50/10 data-[selected=true]:text-slate-50 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";

/** The keys that do this command anywhere, shown at the right edge of its row. */
function CommandShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto flex items-center gap-1", className)} {...props} />;
}

export {
  CommandShortcut,
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
};
