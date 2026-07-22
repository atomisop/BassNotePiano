import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { getRoadmap } from "@/lib/access";
import { ScaleRoadmap } from "@/components/progression/ScaleRoadmap";

export default async function DashboardPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  const roadmap = await getRoadmap(session.user.id);
  const completedCount = roadmap.filter((s) => s.status === "COMPLETED").length;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Your roadmap</p>
      <h1 className="mt-1.5 font-serif text-3xl text-neutral-50">
        {completedCount === roadmap.length
          ? "All six scales complete"
          : `${completedCount} of ${roadmap.length} scales complete`}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-neutral-500">
        Work through each scale in order — read the module, log your practice, then pass the quiz to unlock the
        next one.
      </p>

      <div className="mt-8">
        <ScaleRoadmap roadmap={roadmap} />
      </div>
    </div>
  );
}
