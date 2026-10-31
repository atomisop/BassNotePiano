import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A drawn iPhone: titanium rim and side buttons. Pure CSS, so it stays sharp at any size. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-[300px]", className)}>
      {/* side buttons */}
      <span aria-hidden className="absolute -left-[3px] top-[17%] h-7 w-[3px] rounded-l bg-titanium" />
      <span aria-hidden className="absolute -left-[3px] top-[25%] h-12 w-[3px] rounded-l bg-titanium" />
      <span aria-hidden className="absolute -left-[3px] top-[34%] h-12 w-[3px] rounded-l bg-titanium" />
      <span aria-hidden className="absolute -right-[3px] top-[28%] h-20 w-[3px] rounded-r bg-titanium" />

      <div className="rounded-[2.9rem] bg-gradient-to-b from-titanium-hi via-titanium-mid to-titanium-lo p-[3px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
        <div className="rounded-[2.75rem] bg-black p-[7px]">
          <div className="relative aspect-[856/1852] w-full overflow-hidden rounded-[2.2rem] bg-black">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
