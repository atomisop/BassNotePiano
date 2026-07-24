import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { LessonPurchaseFlow } from "./LessonPurchaseFlow";

export default async function BillingLessonsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/lessons");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Live Lessons</p>
      <h1 className="mt-1.5 font-serif text-2xl text-slate-50">Buy lesson credits</h1>
      <p className="mt-2 text-sm text-slate-500">
        $50 per 30-minute session — Online or In-Person, any quantity. In-Person bundles save 20% on the lesson
        total, no matter how many you buy.
      </p>

      <div className="mt-6">
        <LessonPurchaseFlow zelleHandle={zelleHandle} />
      </div>
    </div>
  );
}
