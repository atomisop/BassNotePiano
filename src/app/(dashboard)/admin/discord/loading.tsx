import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Mirrors the page: heading, the bot tools, then the list of people. */
export default function AdminDiscordLoading() {
  return (
    <SkeletonScreen label="Loading Discord">
      <div>
        <Skeleton className="h-3 w-14" />
        <Skeleton className="mt-1.5 h-8 w-40" />
        <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
        <div className="glass-surface mt-6 divide-y divide-ink/10 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
