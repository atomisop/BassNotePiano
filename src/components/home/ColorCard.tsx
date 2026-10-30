import type { HTMLAttributes } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * Home's colored cards: each one its own color, deep at the bottom right like the roadmap picture card, the same in both themes.
 * Inside, text is white and the accent (buttons, rings, ticks) turns white too (the `.color-tile` rule in globals.css), so nothing
 * orange sits on a colored card. The top left colors keep white text at about 4.5:1 or better.
 */
export const TILE_COLORS = {
  sunset: { from: "#bd5634", via: "#8f3d27", to: "#2a1a1c" },
  ocean: { from: "#2f74b5", via: "#24508a", to: "#141a2a" },
  rose: { from: "#c04a63", via: "#8a2f45", to: "#22141c" },
  forest: { from: "#37804f", via: "#2a6040", to: "#13201a" },
  gold: { from: "#9a6a18", via: "#6e4a14", to: "#21190f" },
  teal: { from: "#24857f", via: "#1c615d", to: "#10201f" },
  plum: { from: "#9455a3", via: "#66357a", to: "#1c1424" },
  indigo: { from: "#5a5cc4", via: "#3f4091", to: "#16162a" },
} as const;
export type TileColor = keyof typeof TILE_COLORS;

export function ColorCard({ color, className, style, ...props }: HTMLAttributes<HTMLDivElement> & { color: TileColor }) {
  const c = TILE_COLORS[color];
  return (
    <Card
      className={cn("color-tile overflow-hidden", className)}
      style={{ ...style, ["--tile-from" as string]: c.from, ["--tile-via" as string]: c.via, ["--tile-to" as string]: c.to }}
      {...props}
    />
  );
}
