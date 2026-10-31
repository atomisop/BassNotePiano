"use client";

import { NotifyToggle, useNotifyStudent } from "@/components/admin/NotifyToggle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hourglass, KeyRound, Pencil } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { buttonVariants } from "@/components/ui/button";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { toast } from "@/components/ui/Toaster";
import { sendPasswordResetAction, setTrialAction, updateAccountDetailsAction } from "@/app/(dashboard)/admin/users/[userId]/actions";

const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TRIAL_CHOICES = [3, 7, 14, 30];

/**
 * Owner only, in the Account card on the student page: fix the name, email or phone a student typed, email them a password reset code,
 * and give, extend or end their free trial.
 */
export function AdminAccountTools(props: { userId: string; name: string; email: string; phone: string; /** ISO, while a trial is running. */ trialEndsAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<"details" | "reset" | "trial" | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(props.name);
  const [email, setEmail] = useState(props.email);
  const [phone, setPhone] = useState(props.phone);
  const [days, setDays] = useState(7);
  const [notify, setNotify] = useNotifyStudent("student-changes");
  const first = props.name.split(" ")[0] || "the student";
  const trialEnd = props.trialEndsAt ? new Date(props.trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" }) : null;

  async function run(work: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(true);
    const result = await work().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success(result.message);
    setOpen(null);
    router.refresh();
  }

  const close = (next: boolean) => !busy && !next && setOpen(null);
  const actions = (label: string, onClick: () => void, disabled = false, danger = false) => (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={busy} onClick={() => setOpen(null)} className={buttonVariants({ variant: "secondary" })}>
        Cancel
      </button>
      <button type="button" disabled={busy || disabled} onClick={onClick} aria-busy={busy} className={buttonVariants({ variant: danger ? "danger" : "primary" })}>
        {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
        {label}
      </button>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(props.name);
          setEmail(props.email);
          setPhone(props.phone);
          setOpen("details");
        }}
        aria-haspopup="dialog"
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        <Pencil aria-hidden className="h-4 w-4" />
        Edit details
      </button>
      <button type="button" onClick={() => setOpen("reset")} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <KeyRound aria-hidden className="h-4 w-4" />
        Send reset code
      </button>
      <button type="button" onClick={() => setOpen("trial")} aria-haspopup="dialog" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <Hourglass aria-hidden className="h-4 w-4" />
        {trialEnd ? `Trial until ${trialEnd}` : "Free trial"}
      </button>

      <Dialog open={open === "details"} onOpenChange={close} title="Edit account details">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">First and last name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={field} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={field} />
            <span className="text-small text-slate-500">They sign in with this address, and their codes go to it. A new one shows as not verified.</span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Phone</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" placeholder="Leave empty to remove it" className={field} />
          </label>
          {actions("Save", () => void run(() => updateAccountDetailsAction(props.userId, { name, email, phone }, notify)), !name.trim() || !email.trim())}
        </div>
      </Dialog>

      <Dialog open={open === "reset"} onOpenChange={close} title="Send a password reset code">
        <div className="grid gap-4">
          <p className="text-small text-slate-300">
            Emails {first} a code at {props.email}, the same one Forgot password sends. They type it on the sign-in screen to choose a new password. Their current password keeps working until they do.
          </p>
          {actions("Send the code", () => void run(() => sendPasswordResetAction(props.userId)))}
        </div>
      </Dialog>

      <Dialog open={open === "trial"} onOpenChange={close} title="Free trial">
        <NotifyToggle on={notify} onChange={setNotify} className="mb-3" />
        <div className="grid gap-4">
          <p className="text-small text-slate-300">
            {trialEnd ? `${first}'s trial runs until ${trialEnd}.` : `${first} has no running trial.`} A trial opens the first lessons of Scale 1. Pick how long it runs from today.
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Trial length">
            {TRIAL_CHOICES.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={buttonVariants({ variant: days === d ? "primary" : "secondary", size: "sm" })}
              >
                {d} days
              </button>
            ))}
          </div>
          {actions(`Run it for ${days} days`, () => void run(() => setTrialAction(props.userId, days, notify)))}
          {trialEnd && (
            <button type="button" disabled={busy} onClick={() => void run(() => setTrialAction(props.userId, 0, notify))} className="tap inline-flex items-center justify-self-start text-small text-red-300 underline underline-offset-4">
              End the trial now
            </button>
          )}
        </div>
      </Dialog>
    </>
  );
}
