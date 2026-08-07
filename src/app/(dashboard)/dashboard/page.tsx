import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";
import { BadgeSummary } from "@/components/gamification/BadgeSummary";

export default async function DashboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const [roadmap, badgeCount, user] = await Promise.all([
    getRoadmap(session.user.id),
    prisma.userBadge.count({ where: { userId: session.user.id } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { currentStreak: true } }),
  ]);
  const completedCount = roadmap.filter((s) => s.status === "COMPLETED").length;
  const percent = roadmap.length > 0 ? Math.round((completedCount / roadmap.length) * 100) : 0;
  const nextUp = roadmap.find((s) => s.status !== "COMPLETED");

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Roadmap</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Your path through the kiñit system</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-500">
        Six scales, one connected path. Complete each module, practice, and quiz to move forward.
      </p>

      <div className="glass-surface mt-6 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Your progress</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <p className="font-serif text-2xl text-slate-50">
            {completedCount} of {roadmap.length} scales completed
          </p>
          <p className="font-serif text-2xl text-amber-400">{percent}%</p>
        </div>
        {nextUp && <p className="mt-1 text-sm text-slate-500">Next up: {nextUp.scaleGroup.title}</p>}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mt-6">
        <BadgeSummary earnedCount={badgeCount} currentStreak={user?.currentStreak ?? 0} />
      </div>

      <div className="mt-8">
        <ScaleRoadmap roadmap={roadmap} />
      </div>
    </div>
  );
}
