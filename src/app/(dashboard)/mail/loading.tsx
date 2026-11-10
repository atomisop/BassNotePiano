import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { WideLayout } from "@/components/layout/PageLayouts";

/** Mirrors Mail: the title, then message rows with a subject line, a preview and a date. */
export default function MailLoading() {
  return (
    <SkeletonScreen label="Loading mail">
      <WideLayout>
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-2.5 h-10 w-32" />
        <div className="mt-6 divide-y divide-slate-50/8 rounded-card bg-neu-base shadow-raised-low">
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
