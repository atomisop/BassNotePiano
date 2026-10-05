import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { BuyCreditsFlow } from "./BuyCreditsFlow";

export default async function BuyCreditsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/billing/credits");

  const zelleHandle = process.env.ZELLE_HANDLE ?? "payments@yourplatform.com";

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link
        href="/lessons"
        className="tap mb-4 flex w-fit items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100"
      >
        <ArrowLeftIcon size={16} />
        Back to classes
      </Link>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Extra sessions</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Buy extra classes</h1>
      <div className="mt-6 glass-surface p-6 sm:p-8">
        <BuyCreditsFlow zelleHandle={zelleHandle} />
      </div>
    </div>
  );
}
