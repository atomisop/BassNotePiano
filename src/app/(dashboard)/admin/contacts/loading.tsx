import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors Contacts: the title, a search box and kind pills, then rows with a name, an email line and a status. */
export default function ContactsLoading() {
  return (
    <SkeletonScreen label="Loading contacts">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2.5 h-10 w-44" />
      <Skeleton className="mt-5 h-11 w-full rounded-full" />
      <div className="mt-4 flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-surface flex items-center gap-4 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
