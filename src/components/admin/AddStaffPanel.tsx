"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffCandidate, StaffLookup } from "@/lib/staffAdd";
import { newIdempotencyKey } from "@/lib/idempotencyClient";
import { Avatar } from "@/components/ui/Avatar";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Plus } from "@/components/ui/appIcons";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

const field = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Add staff" (owner only): type an email, see whose account it is, confirm. The new person then appears in the list with their alerts
 * open (`onAdded`), so giving someone access is one place instead of Accounts, their page, "Make admin" and back here.
 */
export function AddStaffPanel({
  onFind,
  onAdd,
  onAdded,
}: {
  onFind: (email: string) => Promise<StaffLookup>;
  onAdd: (userId: string, idempotencyKey?: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onAdded: (userId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<StaffCandidate | null>(null);
  const [busy, setBusy] = useState<"find" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());

  function reset() {
    setOpen(false);
    setEmail("");
    setFound(null);
    setError(null);
  }

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("find");
    setError(null);
    setFound(null);
    try {
      const res = await onFind(email.trim());
      if (res.ok) setFound(res.account);
      else setError(res.error);
    } catch {
      setError("That did not go through. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (!found) return;
    setBusy("add");
    setError(null);
    try {
      const res = await onAdd(found.id, key);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setKey(newIdempotencyKey());
      toast.success(`${found.name ?? found.email} is now staff.`);
      onAdded(res.id);
      reset();
      router.refresh();
    } catch {
      setError("That did not go through. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-keep-chrome="" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <Plus aria-hidden className="h-4 w-4" />
        Add staff
      </button>
    );
  }

  return (
    <div className="glass-surface space-y-3 p-4">
      {!found ? (
        <form onSubmit={find} className="space-y-3">
          <label className="block">
            <span className="text-small text-slate-300">Their email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              autoFocus
              className={`${field} mt-1.5`}
              placeholder="name@email.com"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} disabled={busy !== null} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Cancel
            </button>
            <button type="submit" disabled={busy !== null || !email.trim()} className={buttonVariants({ variant: "primary", size: "sm" })}>
              {busy === "find" && <MorphingSquare size={12} className="shrink-0" />}
              {busy === "find" ? "Looking…" : "Find account"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar image={found.image} label={found.name ?? found.email} size="md" />
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-slate-50">{found.name ?? found.email}</p>
              <p className="truncate text-small text-slate-500">
                {found.email}
                {found.onPlan && " · keeps their plan"}
              </p>
            </div>
          </div>
          <p className="text-small text-slate-400">Make them staff? They can see every student, payment and message, and they are told.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFound(null)} disabled={busy !== null} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Back
            </button>
            <button type="button" onClick={() => void add()} disabled={busy !== null} className={buttonVariants({ variant: "primary", size: "sm" })}>
              {busy === "add" && <MorphingSquare size={12} className="shrink-0" />}
              {busy === "add" ? "Adding…" : "Make staff"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-small text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
