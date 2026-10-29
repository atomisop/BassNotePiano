import Link from "next/link";
import { Hint } from "@/components/ui/Hint";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { minutesLeft, practiceHref } from "@/lib/fingerPracticeConstants";

/** Shown in place of a lesson until today's 10 minutes of finger exercises are done. */
export function FingerPracticeGate({
  todaySeconds,
  goalSeconds,
  streak,
  returnTo,
}: {
  todaySeconds: number;
  goalSeconds: number;
  streak: number;
  /** This lesson's own path, so the practice screen can bring the student straight back. */
  returnTo: string;
}) {
  const left = minutesLeft(todaySeconds, goalSeconds);
  const started = todaySeconds > 0;
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <Eyebrow>Daily finger exercises</Eyebrow>
        <h1 className="mt-2 text-title font-semibold text-slate-50">Finish today&apos;s 10 minutes first</h1>
        <p className="mt-3 text-small font-medium text-slate-200">{started ? `${left} minute${left === 1 ? "" : "s"} left today` : "10 minutes to go"}</p>
        {streak > 0 && <p className="mt-1 text-small text-slate-500">{streak} day streak. Don&apos;t break it.</p>}
        <Link href={practiceHref(returnTo)} className={cn(buttonVariants(), "mt-5")}>
          {started ? "Continue practice" : "Start practice"}
        </Link>
        <p className="mt-3 flex items-center gap-1 text-small text-slate-500">
          Screen on while you practice
          <Hint>The timer only counts while this app is open and in view.</Hint>
        </p>
      </Card>
    </div>
  );
}
