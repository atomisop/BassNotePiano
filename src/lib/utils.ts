import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
