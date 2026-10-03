/**
 * Scrolls only the nearest `overflow-y-auto` list around `target`, never any
 * ancestor. `Element.scrollIntoView` scrolls every scrollable ancestor, and
 * that includes the dashboard shell's `overflow-hidden` wrappers (hidden
 * overflow is still programmatically scrollable). The shell outlives route
 * changes, so a chat scrolling it left it shifted on every page afterwards,
 * showing a strip of page ground under the dock.
 */
export function scrollWithin(target: HTMLElement | null, block: "end" | "center") {
  const list = target?.closest<HTMLElement>(".overflow-y-auto");
  if (!target || !list) return;
  const listRect = list.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const offset = rect.top - listRect.top + list.scrollTop;
  const top = block === "end" ? list.scrollHeight : offset - (list.clientHeight - rect.height) / 2;
  list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}
