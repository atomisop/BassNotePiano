import { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonPill, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Mirrors Admin > Classes > Schedule: the Admin eyebrow and title, the Times / Attendance / Reserved switch, then the page's cards. The
 * attendance list is the busiest view, so the cards are shaped like its class cards: a time and a chip, then one line per student.
 */
export default function AdminScheduleLoading() {
  return (
    <SkeletonScreen label="Loading weekly schedule">
      <div>
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-2.5 h-10 w-60" />

        <div className="mt-6 flex w-fit max-w-full gap-1 rounded-full bg-neu-base p-1 shadow-pressed-low">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonPill key={i} className="h-8 w-20" />
          ))}
        </div>

        <div className="mt-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton delay={i * 0.1} className="h-5 w-44 rounded-full" />
                <Skeleton delay={i * 0.1} className="h-6 w-14 rounded-full" />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-neu-base p-2 shadow-pressed-low">
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size={32} />
                  <div>
                    <Skeleton className="h-4 w-28 rounded-full" />
                    <Skeleton className="mt-1.5 h-3 w-36 rounded-full" />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
