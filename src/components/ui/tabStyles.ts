import { cn } from "@/lib/utils";

/**
 * The one look for tab-like controls: an inset track with the chosen item raised and in the signal color.
 * `Tabs` (buttons) and every row of links that works like tabs (admin filters, admin sections) share it.
 */
export const TAB_TRACK =
  "ios-seg inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-neu-base p-1 shadow-pressed-low [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function tabItem(active: boolean, opts?: { thumb?: boolean }): string {
  return cn(
    "tap press ios-seg-item relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-small font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
    active ? cn("ios-seg-on text-signal", !opts?.thumb && "bg-neu-base shadow-raised-low") : "text-slate-400 hover:text-slate-100",
  );
}
