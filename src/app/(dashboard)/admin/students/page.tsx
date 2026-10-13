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

export const metadata = { title: "Admin: Students" };

export default async function AdminStudentsPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "PENDING";
  const registrations = await getAdminClassRegistrations(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Students</h1>
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
