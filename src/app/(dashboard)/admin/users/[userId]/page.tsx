import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/lib/adminCustomer";
import { CustomerProfile } from "@/components/admin/CustomerProfile";
import { setCurriculumAccessAction, toggleScaleUnlockAction, clearAssistantHistoryAction, setUserRoleAction } from "../actions";
import { adjustUserCreditsAction } from "../../credits/actions";
import { adminCancelBookingAction } from "../../bookings/actions";
import { adminForceSignOutAction } from "./actions";

export default async function AdminCustomerPage({ params }: { params: { userId: string } }) {
  const profile = await getCustomerProfile(params.userId);
  if (!profile) notFound();

  return (
    <div>
      <Link href="/admin/users" className="text-xs font-medium text-slate-500 transition hover:text-slate-300">
        ← All users
      </Link>
      <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">{profile.user.name ?? profile.user.email}</h1>
      <p className="mt-2 text-sm text-slate-500">
        Everything about this student in one place — curriculum, payments, credits, bookings, and support history.
      </p>

      <div className="mt-8">
        <CustomerProfile
          profile={profile}
          onSetCurriculumAccess={setCurriculumAccessAction}
          onToggleScale={toggleScaleUnlockAction}
          onClearAssistantHistory={clearAssistantHistoryAction}
          onSetRole={setUserRoleAction}
          onAdjustCredits={adjustUserCreditsAction}
          onCancelBooking={adminCancelBookingAction}
          onForceSignOut={adminForceSignOutAction}
        />
      </div>
    </div>
  );
}
