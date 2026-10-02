import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The class-name helper every shadcn component expects.
 *
 * `clsx` flattens conditionals/arrays/objects into a string; `twMerge` then
 * resolves Tailwind conflicts so a caller's `className` actually wins over a
 * component's own default (`cn("px-4", "px-6")` → `"px-6"`, not both). Plain
 * string concatenation would leave both classes in the list and let source
 * order in the stylesheet decide — which is why a `className` override on a
 * shadcn component silently does nothing without this.
 */
// Teaches twMerge the design system's own token names (globals.css @theme).
// Without this it reads `text-small` as a text *color*, so `cn("text-small",
// "text-slate-50")` would silently drop the font size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["hero", "body", "small"] }],
      shadow: [{ shadow: ["plane-mid", "plane-front", "signal"] }],
      rounded: [{ rounded: ["control", "card", "sheet"] }],
      "rounded-t": [{ "rounded-t": ["control", "card", "sheet"] }],
      "max-w": [{ "max-w": ["wide", "settings", "narrow", "pane"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
