import { ActionTiles, type ActionTile } from "@/components/ui/ActionTiles";

export type LessonTile = ActionTile;

/** "What do you want to do?": the few things a student does from Lessons, each a tap. */
export function LessonsTiles({ items, className }: { items: LessonTile[]; className?: string }) {
  return <ActionTiles title="What do you want to do?" items={items} className={className} />;
}
