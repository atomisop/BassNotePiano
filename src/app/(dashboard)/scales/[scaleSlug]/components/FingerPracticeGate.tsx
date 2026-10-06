import Link from "next/link";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown in place of a lesson until today's 10 minutes of finger exercises are done. */
export function FingerPracticeGate({ todaySeconds, goalSeconds }: { todaySeconds: number; goalSeconds: number }) {
  const left = Math.max(0, Math.ceil((goalSeconds - todaySeconds) / 60));
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <Eyebrow>Daily finger exercises</Eyebrow>
        <h1 className="mt-2 text-body font-semibold text-slate-50">Finish today&apos;s 10 minutes first</h1>
        <p className="mt-2 text-small text-slate-400">{left} minute{left === 1 ? "" : "s"} left. Your scales unlock right after.</p>
        <Link href="/practice" className={cn(buttonVariants(), "mt-5")}>
          Start practice
        </Link>
      </Card>
    </div>
  );
}
