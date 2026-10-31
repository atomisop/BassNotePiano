"use client";

import { createContext, useContext } from "react";
import { Star } from "@/components/ui/appIcons";

/**
 * The studio owner's account carries a small gold star on its avatar, and
 * everyone sees it. The layout looks the owner's user id up once and shares it
 * here, so any avatar that knows whose it is can show the star without each
 * list having to carry an "is owner" flag of its own.
 */
const OwnerIdContext = createContext<string | null>(null);

export function OwnerStarProvider({ ownerId, children }: { ownerId: string | null; children: React.ReactNode }) {
  return <OwnerIdContext.Provider value={ownerId}>{children}</OwnerIdContext.Provider>;
}

export function useIsOwner(userId: string | null | undefined): boolean {
  const ownerId = useContext(OwnerIdContext);
  return !!ownerId && !!userId && ownerId === userId;
}

/** The star itself. Place inside a `relative` wrapper that is not `overflow-hidden`. */
export function OwnerStarBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-neu-base shadow-raised-low ${className}`}
      title="Owner"
      aria-label="Owner"
    >
      <Star className="h-2.5 w-2.5 text-amber-400" fill="currentColor" strokeWidth={0} />
    </span>
  );
}
