import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Mail: the Back link and title, the band (the unread count), the three tiles, then message rows with a subject, a preview and a date. */
export default function MailLoading() {
  return (
    <SkeletonScreen label="Loading mail">
      <WideLayout>
        <Skeleton className="mb-2 h-5 w-16" />
        <Skeleton className="h-10 w-32" />
        {/* The band and its sheet. */}
        <Skeleton className="mt-6 h-44 w-full rounded-sheet" />
        {/* The tiles. */}
        <Skeleton className="mt-6 h-3 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>

        <div className="mt-6 divide-y divide-slate-50/8 lgx-card rounded-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 md:px-5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3.5 w-14" />
              </div>
              <Skeleton className="mt-2.5 h-3.5 w-5/6" />
            </div>
          ))}
        </div>
      </WideLayout>
    </SkeletonScreen>
  );
}
