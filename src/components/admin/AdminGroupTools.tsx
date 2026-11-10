"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import {
  changeGroupPayerAction,
  groupViewAction,
  linkParentAction,
  listParentLinksAction,
  separateFromGroupAction,
  unlinkParentAction,
} from "@/app/(dashboard)/admin/payment-plans/actions";
import type { AdminLinkRow, GroupView } from "@/lib/adminGroupTools";
import type { PlanFix } from "@/lib/planFixes";
import { PlanFixPanel } from "@/components/admin/PlanFixPanel";

const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
type Result = { ok: true; message: string } | { ok: false; error: string; fix?: PlanFix | null };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // A refusal the owner can fix here (a payment waiting for review, a group start not yet approved) shows the payment in the dialog.
  const [refusal, setRefusal] = useState<{ error: string; fix: PlanFix } | null>(null);
  async function run(key: string, work: () => Promise<Result>, after?: () => void | Promise<void>) {
    setBusy(key);
    setRefusal(null);
    const label = { split: "Moving them onto their own plan", payer: "Changing who pays", link: "Linking the parent" }[key] ?? "Unlinking the parent";
    const hold = await toast.held(label, () => work().catch((): Result => ({ ok: false, error: "Something went wrong. Try again." })), { mail: true });
    setBusy(null);
    if (hold.undone) return;
    const result = hold.value;
    if (!result.ok) {
      if (result.fix) setRefusal({ error: result.error, fix: result.fix });
      return void toast.warning(result.error);
    }
    toast.success(result.message);
    await after?.();
    router.refresh();
  }
  return { busy, run, refusal, clearRefusal: () => setRefusal(null) };
}

/**
 * Owner only, next to the plan tools when this person is on a group or parent plan, or pays for one without a plan of their own
 * (`planId` null): who is on it, who pays, and the two fixes.
 */
export function AdminGroupButton({ groupId, planId, userId, label = "Group" }: { groupId: string; planId: string | null; userId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<GroupView | null>(null);
  const [payer, setPayer] = useState("");
  const [confirmSplit, setConfirmSplit] = useState(false);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const { busy, run, refusal, clearRefusal } = useRun();

  async function load() {
    const result = await groupViewAction(groupId).catch(() => ({ ok: false as const, error: "Could not load the group." }));
    if (!result.ok) {
      toast.warning(result.error);
      setOpen(false);
      return;
    }
    setView(result.view);
    setPayer("");
  }

  function show() {
    setOpen(true);
    setView(null);
    setConfirmSplit(false);
    clearRefusal();
    void load();
  }

  // Set up plan's "Open the Group tool" (a group plan is set up together): this button stays mounted in the Plan menu, so it listens.
  // Only the button for the person's own plan answers (the page can also show Group buttons for groups they only pay for).
  useEffect(() => {
    if (!planId) return;
    const onOpen = () => show();
    window.addEventListener("bnp-open-group-tool", onOpen);
    return () => window.removeEventListener("bnp-open-group-tool", onOpen);
  });

  const me = planId ? view?.members.find((m) => m.planId === planId) : undefined;
  const isPayer = view?.payer.id === userId;
  const running = view?.members.filter((m) => m.status === "ACTIVE") ?? [];

  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8 px-2.5" })}>
        <Users aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title={view?.kind === "PARENT" ? "Parent plan" : "Group plan"}>
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        {refusal && (
          <div className="mb-4 space-y-2">
            <p role="alert" className="text-small text-red-400">{refusal.error}</p>
            <PlanFixPanel
              fix={refusal.fix}
              notify={notify}
              onDone={() => {
                clearRefusal();
                void load();
              }}
            />
          </div>
        )}
        {!view ? (
          <div className="inline-flex items-center gap-2 text-small text-slate-400">
            <MorphingSquare size={12} />
            Loading the group
          </div>
        ) : (
          <div className="grid gap-5">
            <div>
              <p className="text-small text-slate-400">
                Paid by <span className="font-medium text-slate-100">{view.payer.name}</span>. Each person has their own weekly time, credits and bill.
              </p>
              <ul className="mt-2 divide-y divide-slate-50/10 rounded-xl bg-neu-base px-3 shadow-pressed-low">
                {running.map((m) => (
                  <li key={m.planId} className="flex items-center justify-between gap-3 py-2.5 text-small">
                    <span className="min-w-0 truncate text-slate-200">
                      {m.name}
                      {m.planId === planId ? " (this account)" : ""}
                    </span>
                    <span className="shrink-0 text-slate-400">{m.started ? `${usd(m.priceCents)} a bill` : "Not started"}</span>
                  </li>
                ))}
              </ul>
            </div>

            {me && (
              <div className="grid gap-2">
                <p className="text-small font-medium text-slate-200">Give this person their own plan</p>
                <p className="text-small text-slate-400">
                  {isPayer && view.kind === "FAMILY" && running.length > 1
                    ? "This person pays for the group. Make someone else the payer first."
                    : "Same weekly time, term, credits and paid bills. From the next bill they pay the solo price themselves. The group carries on without them."}
                </p>
                {confirmSplit ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => setConfirmSplit(false)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Keep them on it
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run("split", () => separateFromGroupAction(me.planId, notify), () => setOpen(false))}
                      className={buttonVariants({ variant: "primary", size: "sm" })}
                    >
                      {busy === "split" && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                      Yes, own plan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null || (isPayer && view.kind === "FAMILY" && running.length > 1)}
                    onClick={() => setConfirmSplit(true)}
                    className={buttonVariants({ variant: "secondary", size: "sm", className: "justify-self-start" })}
                  >
                    Move to their own plan
                  </button>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <p className="text-small font-medium text-slate-200">Change who pays</p>
              {view.payerChoices.length === 0 ? (
                <p className="text-small text-slate-400">
                  {view.kind === "FAMILY" ? "Nobody else on the group has a running plan." : "No other parent is linked to every child on this plan. Link one under Parent links first."}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={payer} onChange={(e) => setPayer(e.target.value)} className={`${field} w-auto min-w-48 flex-1`} aria-label="New payer">
                    <option value="">Pick who pays</option>
                    {view.payerChoices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy !== null || !payer}
                    onClick={() => void run("payer", () => changeGroupPayerAction(groupId, payer, notify), load)}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {busy === "payer" && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
                    Make payer
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Owner only, in the Account card: this person's parent links both ways, with a direct link for a family the studio knows. */
export function AdminParentLinksButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<AdminLinkRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"parent" | "child">("parent");
  const [agreed, setAgreed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const { busy, run } = useRun();

  async function load() {
    setLinks(await listParentLinksAction(userId).catch(() => []));
  }

  function show() {
    setOpen(true);
    setLinks(null);
    setEmail("");
    setAgreed(false);
    setRemoving(null);
    void load();
  }

  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8 px-2.5" })}>
        <UserPlus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Parent links
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)} title="Parent links">
        <NotifyToggle on={notify} onChange={setNotify} label="Notify both people" className="mb-3" />
        <div className="grid gap-5">
          {links === null ? (
            <div className="inline-flex items-center gap-2 text-small text-slate-400">
              <MorphingSquare size={12} />
              Loading links
            </div>
          ) : links.length === 0 ? (
            <p className="text-small text-slate-400">No parent links yet.</p>
          ) : (
            <ul className="divide-y divide-slate-50/10 rounded-xl bg-neu-base px-3 shadow-pressed-low">
              {links.map((l) => (
                <li key={l.linkId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-small">
                  <span className="min-w-0 text-slate-200">
                    {l.role === "child" ? "Parent of " : "Child of "}
                    <span className="font-medium">{l.name}</span>
                    {l.status === "PENDING" ? <span className="text-slate-500"> (waiting for a yes)</span> : null}
                  </span>
                  {removing === l.linkId ? (
                    <span className="flex gap-2">
                      <button type="button" disabled={busy !== null} onClick={() => setRemoving(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Keep
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void run(l.linkId, () => unlinkParentAction(userId, l.linkId, notify), load)}
                        className={buttonVariants({ variant: "danger", size: "sm" })}
                      >
                        {busy === l.linkId && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                        End link
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setRemoving(l.linkId)} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-red-300 hover:text-red-200" })}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3">
            <p className="text-small font-medium text-slate-200">Link another account</p>
            <div className="flex gap-2" role="radiogroup" aria-label="This account is the">
              {(["parent", "child"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={buttonVariants({ variant: role === r ? "secondary" : "ghost", size: "sm", className: role === r ? "text-signal-fg hover:text-signal-fg" : "" })}
                >
                  This account is the {r}
                </button>
              ))}
            </div>
            <label className="grid gap-1.5">
              <span className="text-small font-medium text-slate-200">{role === "parent" ? "Child's" : "Parent's"} account email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={field} />
            </label>
            <label className="flex items-start gap-2.5 text-small text-slate-300">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-signal" />
              Both people asked for this. The parent will see the child&apos;s progress, practice and classes, and can change their class times.
            </label>
            <button
              type="button"
              disabled={busy !== null || !agreed || !email.trim()}
              onClick={() => void run("link", () => linkParentAction(userId, email, role, notify), async () => {
                setEmail("");
                setAgreed(false);
                await load();
              })}
              className={buttonVariants({ variant: "primary", size: "sm", className: "justify-self-start" })}
            >
              {busy === "link" && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
              Link them
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
