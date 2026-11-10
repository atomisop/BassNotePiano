"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

/** Removes the contact, their reserved times and their class log. Asks once first. */
export function DeleteContactButton({
  contactId,
  name,
  onDelete,
}: {
  contactId: string;
  name: string;
  onDelete: (contactId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <div>
        {/* Destructive, so quiet red text at the end of the page; the step below still asks first. */}
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-red-300 hover:text-red-200" onClick={() => setConfirming(true)}>Delete this person</Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-card bg-red-400/10 p-4 ring-1 ring-inset ring-red-400/20">
      <p className="text-small font-semibold text-red-300">Delete {name}?</p>
      <p className="text-small text-slate-300">Their reserved times and their class log go too. This cannot be undone.</p>
      {error && <p role="alert" className="text-small text-red-400">{error}</p>}
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={pending}
          onClick={() =>
            start(async () => {
              const hold = await toast.held("Deleting this person", () => onDelete(contactId));
              if (hold.undone) return;
              const result = hold.value;
              if (!result.ok) return setError(result.error);
              router.push("/admin/contacts");
            })
          }
        >
          Yes, delete
        </Button>
      </div>
    </div>
  );
}
