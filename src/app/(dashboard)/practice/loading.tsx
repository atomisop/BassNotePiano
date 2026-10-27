import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Practice: the title, the streak and week strip, then the practice card with its big start control. */
export default function PracticeLoading() {
  return (
    <SkeletonScreen label="Loading practice">
      <WideLayout>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2.5 h-10 w-44" />
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-10 rounded-full" />
          ))}
        </div>
        <div className="glass-surface mt-6 flex flex-col items-center p-8">
          <Skeleton className="h-28 w-28 rounded-full" />
          <Skeleton className="mt-6 h-5 w-48" />
          <Skeleton className="mt-3 h-11 w-40 rounded-full" />
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
