import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Parent mode: the title, then a card per child with three facts and the next class. */
export default function ParentLoading() {
  return (
    <SkeletonScreen label="Loading parent mode">
      <WideLayout>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2.5 h-10 w-52" />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="glass-surface p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3.5 w-28" />
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((k) => (
                  <Skeleton key={k} className="h-9 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
