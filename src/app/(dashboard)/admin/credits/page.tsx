import { searchUsersForCredits, getRecentCreditAdjustments } from "@/lib/creditAdjustments";
import { AdminCreditGrantPanel } from "@/components/admin/AdminCreditGrantPanel";
import { searchUsersForCreditsAction, adjustUserCreditsAction, getUserCreditHistoryAction } from "./actions";

export default async function AdminCreditsPage() {
  const [initialUsers, recentAdjustments] = await Promise.all([
    searchUsersForCredits(""),
    getRecentCreditAdjustments(25),
  ]);

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Class credits</h1>
      <p className="mt-2 text-small text-slate-500">
        Manually grant or deduct class credits — for anything paid outside Zelle, corrections, or goodwill credit.
        Every change is logged with a reason and notifies the student.
      </p>

      <div className="mt-6">
        <AdminCreditGrantPanel
          initialUsers={initialUsers}
          recentAdjustments={recentAdjustments.map((a) => ({
            id: a.id,
            amount: a.amount,
            reasonNote: a.reasonNote,
            createdAtMs: a.createdAt.getTime(),
            userName: a.user.name,
            userEmail: a.user.email,
            adjustedByName: a.adjustedBy.name,
            adjustedByEmail: a.adjustedBy.email,
          }))}
          onSearch={searchUsersForCreditsAction}
          onAdjust={adjustUserCreditsAction}
          onGetHistory={getUserCreditHistoryAction}
        />
      </div>
    </div>
  );
}
