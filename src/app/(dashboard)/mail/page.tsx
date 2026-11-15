import type { CSSProperties } from "react";
import { PageBack } from "@/components/ui/BackLink";
import { Bell, Coins, CreditCard } from "@/components/ui/appIcons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { listMail } from "@/lib/mail";
import { WideLayout } from "@/components/layout/PageLayouts";
import { HeroBand } from "@/components/ui/HeroBand";
import { ActionTiles } from "@/components/ui/ActionTiles";
import { Meta } from "@/components/ui/CardKit";
import { buttonVariants } from "@/components/ui/button";
import { MarkAllReadButton } from "./MarkAllReadButton";

const KIND_LABEL = { ADMIN_MESSAGE: "Message", PAYMENT: "Payment", BILLING: "Billing" } as const;

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

export const metadata = { title: "Mail" };

export default async function MailPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/mail");
  const mail = await listMail(session.user.id);
  const unread = mail.filter((m) => !m.readAt).length;

  return (
    <WideLayout className="space-y-6">
      <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/dashboard" />
        <h1 className="font-hero text-hero font-bold text-balance text-slate-50">Mail</h1>
      </div>

      {/* The band: how much is unread, the one thing Mail is about. Its sheet holds the one control that goes with it. */}
      {mail.length === 0 ? (
        <HeroBand eyebrow="Inbox" title="No mail yet" meta="Messages from the studio, such as a class reminder or a note from your teacher, land here.">
          <div className="pt-3">
            <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Go home
            </Link>
          </div>
        </HeroBand>
      ) : unread > 0 ? (
        <HeroBand eyebrow="Inbox" title="Unread" figure={unread} meta={<Meta items={[`${mail.length} in all`, `Newest ${formatDate(mail[0].createdAt)}`]} />}>
          <div className="pt-3">
            <MarkAllReadButton />
          </div>
        </HeroBand>
      ) : (
        <HeroBand eyebrow="Inbox" title="You're all caught up" meta={<Meta items={[`${mail.length} read`, `Newest ${formatDate(mail[0].createdAt)}`]} />} />
      )}

      <ActionTiles
        title="Related"
        items={[
          { href: "/billing/history", label: "Payments", detail: "Bills and receipts", icon: <Coins /> },
          { href: "/billing/plans", label: "My plan", detail: "Length and next bill", icon: <CreditCard /> },
          { href: "/account?tab=notifications", label: "Notifications", detail: "What we email you", icon: <Bell /> },
        ]}
      />

      {mail.length > 0 && (
        // One list of rows: unread mail stands out by weight and its dot, read mail steps back, and the date is the quietest part.
        <section aria-label="All mail">
      <ul className="divide-y divide-slate-50/8 overflow-hidden rounded-card bg-neu-base shadow-raised-low">
        {mail.map((m, i) => (
          <li key={m.id} style={{ "--i": i } as CSSProperties} className="stagger-item">
            <Link href={`/mail/${m.id}`} className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-slate-50/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5">
              <span
                role={m.readAt ? undefined : "img"}
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${m.readAt ? "bg-transparent" : "bg-signal"}`}
                aria-label={m.readAt ? undefined : "Unread"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`min-w-0 truncate text-body ${m.readAt ? "text-slate-300" : "font-semibold text-slate-50"}`}>{m.title}</p>
                  <span className="shrink-0 text-caption tabular-nums text-slate-500">{formatDate(m.createdAt)}</span>
                </div>
                <p className={`mt-0.5 line-clamp-2 text-small ${m.readAt ? "text-slate-500" : "text-slate-400"}`}>{m.body}</p>
                <p className="mt-1 text-caption text-slate-500">{KIND_LABEL[m.kind]}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
        </section>
      )}
    </WideLayout>
  );
}
