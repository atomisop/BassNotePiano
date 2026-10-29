import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Home: the greeting, then today's card and the roadmap picture card on the left, next class, practice and friends on the right. */
export default function HomeLoading() {
  return (
    <SkeletonScreen label="Loading Home">
      <WideLayout>
        <div className="grid grid-cols-1 gap-3">
          <div className="pt-4 md:pt-6">
            <Skeleton className="h-12 w-3/4 md:h-16 md:w-1/2" />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-3">
              <Skeleton className="h-40 rounded-card" />
              <Skeleton className="h-60 rounded-card md:h-[17rem]" />
            </div>
            <div className="grid gap-3">
              <Skeleton className="h-32 rounded-card" />
              <Skeleton className="h-40 rounded-card" />
              <Skeleton className="h-32 rounded-card" />
            </div>
          </div>
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
