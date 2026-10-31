import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { listMail } from "@/lib/mail";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Card, Eyebrow } from "@/components/ui/Card";
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
        <div data-deck-header className="deck-header -mt-4 flex flex-wrap items-end justify-between gap-3 pt-6">
          <div>
            <Eyebrow>Inbox</Eyebrow>
            <h1 className="mt-1.5 font-hero text-hero font-bold text-balance text-slate-50">Mail</h1>
          </div>
          {unread > 0 && <MarkAllReadButton />}
        </div>

        {mail.length === 0 ? (
          <Card>
            <p className="text-small text-slate-400">No mail yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {mail.map((m) => (
              <Link key={m.id} href={`/mail/${m.id}`} className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card interactive className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${m.readAt ? "bg-transparent" : "bg-signal"}`}
                    aria-label={m.readAt ? undefined : "Unread"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className={`truncate text-small ${m.readAt ? "font-medium text-slate-200" : "font-semibold text-slate-50"}`}>{m.title}</p>
                      <span className="rounded-full bg-neu-base px-2 py-0.5 text-small text-slate-400 shadow-pressed-low">{KIND_LABEL[m.kind]}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-small text-slate-400">{m.body}</p>
                  </div>
                  <span className="shrink-0 text-small text-slate-500">{formatDate(m.createdAt)}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </WideLayout>
  );
}
