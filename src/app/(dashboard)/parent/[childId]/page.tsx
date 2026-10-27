import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { WideLayout } from "@/components/layout/PageLayouts";
import { BackLink } from "@/components/ui/BackLink";
import { ChildView } from "@/components/parent/ChildView";
import { getChildView } from "@/lib/parentChildren";
import { isParentOf } from "@/lib/parentLinks";

export const metadata = { title: "Parent mode" };

export default async function ParentChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/parent/${childId}`);
  // Anyone who is not this child's linked parent sees nothing, not even that the account exists.
  if (!(await isParentOf(session.user.id, childId))) notFound();
  const view = await getChildView(session.user.id, childId);

  return (
    <WideLayout>
      <BackLink href="/parent" className="tap mb-4 flex w-fit items-center gap-1.5 text-small text-slate-400 transition hover:text-slate-100">
        Back
      </BackLink>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Parent mode</p>
      <h1 className="mt-1.5 font-hero text-hero font-bold text-balance text-slate-50">{view.name}</h1>
      <ChildView view={view} />
    </WideLayout>
  );
}
