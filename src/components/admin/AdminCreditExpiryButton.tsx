"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hourglass } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { creditsLabelFromStored } from "@/lib/classCreditPricing";
import { listCreditGrantsAction, setCreditExpiryAction } from "@/app/(dashboard)/admin/users/[userId]/actions";
import type { LiveCreditGrant } from "@/lib/adminAccountTools";

const SOURCE: Record<string, string> = { PAYMENT_PLAN_INSTALLMENT: "From a plan payment", ADMIN_ADJUSTMENT: "Given by the studio", CLASS_CREDITS: "Bought", FAMILY_BUNDLE: "Family bundle", PRE_LEDGER_BALANCE: "Older balance" };
const ymd = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const pretty = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/** Owner only, in the Class credits card: each batch of credits with its expiry date, which can be moved or removed. */
export function AdminCreditExpiryButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<LiveCreditGrant[] | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notify, setNotify] = useNotifyStudent("credits");

  async function show() {
    setOpen(true);
    setGrants(null);
    const rows = await listCreditGrantsAction(userId).catch(() => []);
    setGrants(rows);
    setDates(Object.fromEntries(rows.map((g) => [g.id, g.expiresAt ? ymd(g.expiresAt) : ""])));
  }

  async function save(grant: LiveCreditGrant, date: string | null) {
    setBusy(grant.id);
    const result = await setCreditExpiryAction(userId, grant.id, date, notify).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(result.message);
    router.refresh();
    void show();
  }

  return (
    <>
      <button type="button" onClick={() => void show()} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <Hourglass aria-hidden className="h-4 w-4" />
        Credit expiry
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="When credits expire">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        {grants === null ? (
          <p className="inline-flex items-center gap-2 text-small text-slate-400">
            <MorphingSquare size={12} />
            Loading credits
          </p>
        ) : grants.length === 0 ? (
          <p className="text-small text-slate-300">No unused credits right now.</p>
        ) : (
          <ul className="grid gap-3">
            {grants.map((g) => {
              const date = dates[g.id] ?? "";
              const changed = date !== (g.expiresAt ? ymd(g.expiresAt) : "");
              return (
                <li key={g.id} className="rounded-xl bg-neu-base p-3 shadow-pressed-low">
                  <p className="text-small font-medium text-slate-200">
                    {creditsLabelFromStored(g.remaining)} left · {SOURCE[g.source] ?? "Credits"}
                  </p>
                  <p className="mt-0.5 text-small text-slate-400">{g.expiresAt ? `Expires ${pretty(g.expiresAt)}` : "Never expires"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      aria-label="New expiry date"
                      value={date}
                      onChange={(e) => setDates((d) => ({ ...d, [g.id]: e.target.value }))}
                      className="h-11 rounded-control border border-(--field-edge) bg-neu-base px-3 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button type="button" disabled={!!busy || !date || !changed} onClick={() => void save(g, date)} className={buttonVariants({ variant: "primary", size: "sm" })}>
                      {busy === g.id && <MorphingSquare size={12} className="mr-1.5 shrink-0" />}
                      Save date
                    </button>
                    {g.expiresAt && (
                      <button type="button" disabled={!!busy} onClick={() => void save(g, null)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Never expire
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );
}
