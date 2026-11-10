import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Parent mode: the title, then one row per child: their name, their next class and a quiet line of facts. */
export default function ParentLoading() {
  return (
    <SkeletonScreen label="Loading parent mode">
      <WideLayout>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2.5 h-10 w-52" />
        <div className="mt-6 divide-y divide-slate-50/8 rounded-card bg-neu-base shadow-raised-low">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-3.5 w-48" />
                <Skeleton className="mt-1.5 h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="h-4 w-4 shrink-0" />
            </div>
          ))}
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
