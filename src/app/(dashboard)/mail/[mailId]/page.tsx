import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { openMail } from "@/lib/mail";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Card, Eyebrow } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContactSupportButton } from "./ContactSupportButton";
import { AnnounceOnMount } from "@/components/layout/AnnounceOnMount";
import { BackLink } from "@/components/ui/BackLink";

const KIND_LABEL = { ADMIN_MESSAGE: "Message", PAYMENT: "Payment", BILLING: "Billing" } as const;
const DEFAULT_ACTION = { ADMIN_MESSAGE: null, PAYMENT: { label: "View billing history", href: "/billing/history" }, BILLING: { label: "View your plan", href: "/billing/plans" } } as const;

export const metadata = { title: "Mail" };

export default async function MailDetailPage(props: { params: Promise<{ mailId: string }> }) {
  const params = await props.params;
  const session = await getServerAuthSession();
  if (!session?.user) redirect(`/login?callbackUrl=/mail/${params.mailId}`);
  const mail = await openMail(session.user.id, params.mailId);
  if (!mail) notFound();

  const action = mail.actionHref ? { label: mail.actionLabel ?? "Open", href: mail.actionHref } : DEFAULT_ACTION[mail.kind];
  const canContact = mail.supportCta || mail.kind !== "ADMIN_MESSAGE";

  return (
    <WideLayout>
      {/* Opening a message marks it read: the bell and mail count drop right now. */}
      <AnnounceOnMount kinds={["notifications"]} />
      <div className="mx-auto grid max-w-2xl gap-(--space-group)">
        <BackLink href="/mail" className="tap inline-flex items-center text-small font-medium text-slate-400 hover:text-slate-200">
          Back
        </BackLink>
        <Card>
          <Eyebrow>{KIND_LABEL[mail.kind]}</Eyebrow>
          <h1 className="mt-2 text-title font-semibold text-slate-50">{mail.title}</h1>
          <p className="mt-1 text-small text-slate-500">
            {mail.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET
          </p>
          <p className="mt-4 whitespace-pre-wrap text-small text-slate-200">{mail.body}</p>

          {(action || canContact) && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {action && (
                <Link href={action.href} className={cn(buttonVariants())}>
                  {action.label}
                </Link>
              )}
              {canContact && <ContactSupportButton mailId={mail.id} alreadyOpened={!!mail.supportCaseId} />}
            </div>
          )}
        </Card>
      </div>
    </WideLayout>
  );
}
