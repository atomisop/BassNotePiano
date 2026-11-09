"use client";

import { useState } from "react";
import Link from "next/link";
import type { FollowUp, FollowUpPerson } from "@/lib/adminFollowUps";
import { RemindButton } from "@/components/admin/RemindButton";
import { BulkConfirmButton } from "@/components/admin/BulkConfirmButton";
import { sendAllFollowUpRemindersAction } from "@/app/(dashboard)/admin/followup-actions";
import { bulkReminderQuestion } from "@/lib/followUpRules";

/**
 * One follow-up reason's people: the first few, "and N more" that opens the rest right here, a Remind next to each, and "Remind all N"
 * for the whole reason. A bill a payer covers names the payer, since that is who the reminder goes to.
 */
export function FollowUpPeople({ followUp, remindable }: { followUp: Pick<FollowUp, "key" | "title" | "total" | "people" | "more">; remindable: boolean }) {
  const [open, setOpen] = useState(false);
  const shown: FollowUpPerson[] = open ? [...followUp.people, ...followUp.more] : followUp.people;
  const hidden = followUp.total - shown.length;
  const canOpen = !open && followUp.more.length > 0;

  return (
    <div className="mt-1.5 space-y-2">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-small">
        {shown.map((p) => (
          <span key={p.id} className="inline-flex flex-wrap items-center gap-2">
            <Link href={`/admin/users/${p.id}`} className="tap inline-flex items-center text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-slate-50">
              {p.name}
            </Link>
            {p.payer && <span className="text-slate-500">paid by {p.payer.name}</span>}
            {remindable && <RemindButton kind={followUp.key} userId={p.id} name={p.payer?.name ?? p.name} />}
          </span>
        ))}
        {canOpen ? (
          <button type="button" onClick={() => setOpen(true)} className="tap inline-flex items-center text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-50">
            and {hidden} more
          </button>
        ) : (
          hidden > 0 && <span className="text-slate-500">and {hidden} more</span>
        )}
        {open && followUp.more.length > 0 && (
          <button type="button" onClick={() => setOpen(false)} className="tap inline-flex items-center text-slate-500 hover:text-slate-300">
            Show less
          </button>
        )}
      </p>
      {remindable && followUp.total > 1 && (
        <BulkConfirmButton
          label={`Remind all ${followUp.total}`}
          question={bulkReminderQuestion(followUp.key, followUp.total, followUp.title)}
          confirmLabel="Yes, remind them"
          onConfirm={() => sendAllFollowUpRemindersAction(followUp.key)}
        />
      )}
    </div>
  );
}
