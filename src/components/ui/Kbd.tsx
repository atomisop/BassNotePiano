"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** True on Apple devices, where the modifier is ⌘ rather than Ctrl. Starts false so the server and first paint agree. */
export function useIsApple(): boolean {
  const [apple, setApple] = useState(false);
  useEffect(() => {
    setApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  }, []);
  return apple;
}

/** One or more keys drawn as small keycaps ("Mod" becomes ⌘ or Ctrl). Hidden on touch screens, where there is no keyboard to press them. */
export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  const apple = useIsApple();
  return (
    <span aria-hidden className={cn("hidden items-center gap-0.5 [@media(hover:hover)]:inline-flex", className)}>
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-(--neu-edge) bg-slate-50/6 px-1 font-sans text-caption font-medium leading-none text-slate-400"
        >
          {key === "Mod" ? (apple ? "⌘" : "Ctrl") : key}
        </kbd>
      ))}
    </span>
  );
}
