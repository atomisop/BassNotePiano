"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Link2Off, Mail, Send, X } from "@/components/ui/appIcons";
import { AccountCheckLine, type CheckState } from "@/components/billing/AccountCheckLine";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";
import { looksLikeEmail } from "@/lib/familyMemberCheck";
import { checkFamilyMemberAction } from "@/app/(dashboard)/billing/plans/actions";
import {
  cancelParentLinkAction,
  endParentLinkAction,
  getParentModeStateAction,
  respondToParentLinkAction,
  sendParentLinkAction,
  type ParentModeState,
} from "@/app/(dashboard)/parent/actions";

const field =
  "h-11 min-w-0 flex-1 rounded-control bg-neu-base px-4 text-body text-slate-100 shadow-pressed-low outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Parent mode in Settings and on the Parent page. A parent types a child's account email (checked live, the same "does this account
 * exist" check the plan form uses), the child accepts, and from then on the parent can open the child's progress, practice and classes.
 * A child sees who is asking, and can accept, decline or end a link at any time.
 */
export function ParentLinksPanel() {
  const router = useRouter();
  const [state, setState] = useState<ParentModeState | null>(null);
  const [email, setEmail] = useState("");
  const [check, setCheck] = useState<CheckState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const asked = useRef(new Map<string, Exclude<CheckState, "checking" | "duplicate" | "failed">>());

  const load = useCallback(async () => {
    const next = await getParentModeStateAction().catch(() => null);
    if (next) setState(next);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // While someone has not answered yet, look again every few seconds (not while the tab is hidden).
  const waiting = state?.children.some((c) => c.status === "PENDING") ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  // The typed email is looked up once it stops changing.
  useEffect(() => {
    const typed = email.trim().toLowerCase();
    if (!typed || !looksLikeEmail(typed)) return setCheck(typed ? "invalid" : null);
    const known = asked.current.get(typed);
    if (known) return setCheck(stateFor(typed, known, state));
    setCheck("checking");
    const timer = window.setTimeout(() => {
      checkFamilyMemberAction(typed)
        .then((answer) => {
          if (answer !== "limited") asked.current.set(typed, answer);
          setCheck(stateFor(typed, answer, state));
        })
        .catch(() => setCheck("failed"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [email, state]);

  async function send() {
    const typed = email.trim();
    setBusy("send");
    const result = await sendParentLinkAction(typed).catch(() => ({ ok: false, status: null, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return void toast.warning(result.error ?? "Could not send.");
    toast.success(result.status === "ACCEPTED" ? "Already linked" : result.status === "DECLINED" ? "They declined recently" : "Request sent");
    setEmail("");
    setCheck(null);
    await load();
    router.refresh();
  }

  async function run(key: string, work: () => Promise<{ ok: boolean; error?: string } | void>, done: string) {
    setBusy(key);
    // Ending or withdrawing a link cannot be taken back once done, so those wait for Undo; sending a request goes at once.
    const slow = key.startsWith("end:") || key.startsWith("cancel:");
    const hold = slow ? await toast.held(done.replace(/^Link ended$/, "Ending the link").replace(/^Request withdrawn$/, "Withdrawing the request"), () => work().catch(() => ({ ok: false, error: "Something went wrong. Try again." })), { mail: true }) : null;
    if (hold?.undone) {
      setBusy(null);
      return;
    }
    const result = hold ? hold.value : await work().catch(() => ({ ok: false, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (result && result.ok === false) return void toast.warning(result.error ?? "Could not do that.");
    toast.success(done);
    await load();
    router.refresh();
  }


  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-1 text-small font-medium text-slate-300">
          Add your child&apos;s account
        </div>
        <p className="mt-1 text-small text-slate-400">Type the email their account uses. With no account yet they get an invitation to make one. They get a request and have to accept.</p>
        <div className="mt-2 flex gap-2">
          <input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their account email" aria-label="Child's account email" className={field} />
          <button
            type="button"
            disabled={(check !== "ready" && check !== "no_account") || busy === "send"}
            onClick={() => void send()}
            aria-label="Send request"
            className={buttonVariants({ variant: "primary", size: "sm", className: "h-11 shrink-0 px-4" })}
          >
            {busy === "send" ? <MorphingSquare size={14} /> : <Send aria-hidden className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Send request</span>
          </button>
        </div>
        {check === "no_account" ? (
          // No account yet: the request is kept for this email and they get an invitation, so nobody has to come back and ask again.
          <p className="mt-1.5 flex min-h-5 items-start gap-2 pl-1 text-small text-slate-400" role="status" aria-live="polite">
            <Mail aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-fg" />
            <span>No account yet. Send the request and we email them an invitation. When they sign up with this email, they are asked to accept.</span>
          </p>
        ) : (
          <AccountCheckLine state={check} email={email.trim()} />
        )}
      </div>

      {state === null ? (
        <div className="flex justify-center py-2">
          <MorphingSquare size={16} />
        </div>
      ) : (
        <>
          {state.children.length > 0 && (
            <ul className="divide-y divide-slate-50/10" aria-label="Linked children">
              {state.children.map((c) => (
                <li key={c.linkId} className="flex items-center gap-2 py-2">
                  {c.status === "ACCEPTED" ? (
                    // The whole row opens the child's page, so there is no small button to find.
                    <Link href={`/parent/${c.childId}`} className="press-soft group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-control bg-neu-lift px-4 py-3 shadow-raised-low transition hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-slate-100">{c.name}</span>
                        <span className="block truncate text-small text-slate-500">Linked</span>
                      </span>
                      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-control bg-neu-base px-4 py-3 shadow-pressed-low">
                      <span className="min-w-0">
                        <span className="block truncate text-small font-medium text-slate-300">{c.name}</span>
                        <span className="block truncate text-small text-slate-500">{c.awaitingAccount ? "Waiting for them to create an account" : `Waiting for them to accept · ${c.email}`}</span>
                      </span>
                      <button type="button" disabled={busy === `cancel:${c.linkId}`} onClick={() => void run(`cancel:${c.linkId}`, () => cancelParentLinkAction(c.email), "Request withdrawn")} className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0" })}>
                        Withdraw
                      </button>
                    </div>
                  )}
                  {c.status === "ACCEPTED" && (
                    <button type="button" aria-label={`End the link with ${c.name}`} title="End the link" disabled={busy === `end:${c.childId}`} onClick={() => void run(`end:${c.childId}`, () => endParentLinkAction(c.childId), "Link ended")} className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 w-9 shrink-0 px-0" })}>
                      <Link2Off aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {state.requests.length > 0 && (
            <div>
              <p className="text-small font-medium text-slate-300">Asking to link to your account</p>
              <ul className="mt-2 space-y-2">
                {state.requests.map((r) => (
                  <li key={r.linkId} className="flex items-center justify-between gap-3 rounded-control bg-neu-lift px-4 py-3">
                    <p className="min-w-0 truncate text-small text-slate-100">{r.parentName}</p>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" aria-label={`Accept ${r.parentName}`} disabled={busy === `yes:${r.linkId}`} onClick={() => void run(`yes:${r.linkId}`, () => respondToParentLinkAction(r.linkId, true), "Linked")} className={buttonVariants({ variant: "primary", size: "sm" })}>
                        <Check aria-hidden className="mr-1.5 h-4 w-4" />
                        Accept
                      </button>
                      <button type="button" aria-label={`Decline ${r.parentName}`} disabled={busy === `no:${r.linkId}`} onClick={() => void run(`no:${r.linkId}`, () => respondToParentLinkAction(r.linkId, false), "Declined")} className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 w-8 px-0" })}>
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.parents.length > 0 && (
            <div>
              <p className="text-small font-medium text-slate-300">Parent accounts linked to you</p>
              <ul className="mt-2 divide-y divide-slate-50/10">
                {state.parents.map((p) => (
                  <li key={p.parentId} className="flex items-center justify-between gap-3 py-2.5">
                    <p className="min-w-0 truncate text-body font-medium text-slate-100">{p.name}</p>
                    {/* Only the parent can end an accepted link: a child account is managed by its parent. */}
                    <span className="shrink-0 text-small text-slate-500">Only your parent can end this</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** What the line under the box says: an account that exists, minus one already asked or linked. */
function stateFor(email: string, answer: Exclude<CheckState, "checking" | "duplicate" | "failed">, state: ParentModeState | null): CheckState {
  const existing = state?.children.find((c) => c.email === email);
  if ((answer === "ready" || answer === "no_account") && existing) return existing.status === "ACCEPTED" ? "accepted" : "waiting";
  return answer;
}
