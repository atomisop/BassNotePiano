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
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>Delete this person</Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-card bg-neu-base p-4 shadow-raised-low">
      <p className="text-small text-slate-200">Delete {name}, their reserved times and their class log? This cannot be undone.</p>
      {error && <p role="alert" className="text-small text-red-400">{error}</p>}
      <div className="flex gap-2">
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
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  );
}
