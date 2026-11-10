import type { CSSProperties } from "react";
import { PageBack } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Mail } from "@/components/ui/appIcons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { listMail } from "@/lib/mail";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Eyebrow } from "@/components/ui/Card";
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
    <WideLayout>
      <div className="grid grid-cols-1 gap-(--space-group)">
        <div data-deck-header className="deck-header -mt-4 pt-4">
        <PageBack href="/dashboard" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Inbox</Eyebrow>
            <h1 className="mt-1.5 font-hero text-hero font-bold text-balance text-slate-50">Mail</h1>
          </div>
          {unread > 0 && <MarkAllReadButton />}
        </div>
        </div>

        {mail.length === 0 ? (
          <EmptyState
            icon={<Mail />}
            title="No mail yet"
            description="Messages from the studio, such as a class reminder or a note from your teacher, land here."
            actionLabel="Go home"
            actionHref="/dashboard"
          />
        ) : (
          // One list of rows: unread mail stands out by weight and its dot, read mail steps back, and the date is the quietest part.
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
        )}
      </div>
    </WideLayout>
  );
}
