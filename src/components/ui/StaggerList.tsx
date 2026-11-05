import { Children, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Rows that settle in one after another, 30 ms apart, capped at 8 steps (revamp rule 3). Pure CSS (`stagger-item` in globals.css), so it
 * works in server components and does nothing under reduced motion or right after a keyboard shortcut. Only for the first paint of a list:
 * rows added later should not replay it, so give a stable `key` to each child.
 */
export function StaggerList({ as: Tag = "div", className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return (
    <Tag className={className}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} className={"stagger-item"} style={{ "--i": i } as CSSProperties}>
          {child}
        </div>
      ))}
    </Tag>
  );
}
