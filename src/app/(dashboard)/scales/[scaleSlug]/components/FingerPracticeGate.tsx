import Link from "next/link";
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
        <h1 className="mt-2 text-body font-semibold text-slate-50">Finish today&apos;s 10 minutes first</h1>
        <p className="mt-2 text-small text-slate-400">
          Every scale depends on strong, even fingers, so lessons open once you have done your 10 minutes of finger exercises for the day.
          It resets each morning, and it is the same 10 minutes whichever lesson you want.
        </p>
        <p className="mt-3 text-small font-medium text-slate-200">
          {started ? `${left} minute${left === 1 ? "" : "s"} left today.` : "10 minutes to go."} As soon as you finish, you come straight back here.
        </p>
        {streak > 0 && <p className="mt-1 text-small text-slate-500">{streak} day streak. Don&apos;t break it.</p>}
        <Link href={practiceHref(returnTo)} className={cn(buttonVariants(), "mt-5")}>
          {started ? "Continue practice" : "Start practice"}
        </Link>
        <p className="mt-3 text-small text-slate-500">Keep your screen on while you practice: the timer only counts while this app is open and in view.</p>
      </Card>
    </div>
  );
}
