import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors UserList: a search field, then one quiet row per person.
 */
export default function AdminUsersLoading() {
  return (
    <SkeletonScreen label="Loading users">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-52" />
        <Skeleton className="mt-2 h-4 w-40" />

        <div className="mt-8">
          <Skeleton className="h-10 w-full max-w-sm" />
          <div className="glass-surface mt-5 divide-y divide-slate-50/10 px-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-1.5 h-3.5 w-1/2" />
                </div>
                <Skeleton className="hidden h-4 w-12 shrink-0 sm:block" />
                <Skeleton className="h-4 w-4 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
