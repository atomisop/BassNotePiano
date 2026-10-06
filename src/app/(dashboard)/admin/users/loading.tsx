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
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
