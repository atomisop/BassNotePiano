import type { ReactNode } from "react";
import { HeroBand } from "@/components/ui/HeroBand";

/** Lessons' hero: the next class on the app's band (the day small, the time the biggest thing), its controls on the sheet. */
export function NextClassBand({ eyebrow = "Next class", day, time, meta, children, artwork, className }: { eyebrow?: string; day: string; time?: string; meta?: ReactNode; children?: ReactNode; artwork?: string; className?: string }) {
  return (
    <HeroBand eyebrow={eyebrow} title={day} figure={time} meta={meta} artwork={artwork} className={className}>
      {children}
    </HeroBand>
  );
}
