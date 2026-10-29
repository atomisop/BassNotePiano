import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors the Roadmap screen: the header (the roadmap name), the tabs with the grid / list switch, then the scale cards. */
export default function RoadmapLoading() {
  return (
    <SkeletonScreen label="Loading your roadmap">
      <WideLayout>
        <div className="grid grid-cols-1 gap-y-(--space-group)">
          <div className="pt-4 md:pt-6">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-10 w-48 md:h-12" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-64 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} delay={i * 0.05} className={`h-40 rounded-card ${i >= 3 ? "hidden sm:block" : ""}`} />
            ))}
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
