import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Pricing: the title, then a card of number fields (a label, the box and a help line) and the "what people will see" table. */
export default function AdminPricingLoading() {
  return (
    <SkeletonScreen label="Loading pricing">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="glass-surface mt-6 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3.5 w-3/4 max-w-md" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="mt-1.5 h-10 w-28" />
                <Skeleton className="mt-1.5 h-3 w-3/4" />
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
