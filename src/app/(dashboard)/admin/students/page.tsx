import Link from "next/link";
import type { ClassRegistrationStatus } from "@prisma/client";
import { getAdminClassRegistrations } from "@/lib/classRegistration";
import { StudentQueue } from "@/components/admin/StudentQueue";
import { approveRegistrationAction, rejectRegistrationAction } from "./actions";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";

const FILTERS: { label: string; value: ClassRegistrationStatus | "ALL" }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "All", value: "ALL" },
];

export const metadata = { title: "Admin: Applications" };

export default async function AdminStudentsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "PENDING";
  const registrations = await getAdminClassRegistrations(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <div data-deck-header className="deck-header -mt-4 pt-4">
      <p className="text-small font-medium uppercase tracking-caps text-slate-50/80">Admin</p>
        <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Applicants</h1>
      </div>
      <p className="mt-2 text-small text-slate-500">
        {registrations.length} registration{registrations.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className={`mt-6 ${TAB_TRACK}`}>
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "PENDING" ? "/admin/students" : `/admin/students?status=${filter.value}`}
            className={tabItem(activeFilter === filter.value)}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <StudentQueue
          registrations={registrations}
          onApprove={approveRegistrationAction}
          onReject={rejectRegistrationAction}
          emptyMessage={activeFilter === "PENDING" ? "Nothing pending review." : `No ${activeLabel.toLowerCase()} registrations.`}
        />
      </div>
    </div>
  );
}
