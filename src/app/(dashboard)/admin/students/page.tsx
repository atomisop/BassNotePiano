import Link from "next/link";
import type { ClassRegistrationStatus } from "@prisma/client";
import { getAdminClassRegistrations } from "@/lib/classRegistration";
import { StudentQueue } from "@/components/admin/StudentQueue";
import { approveRegistrationAction, rejectRegistrationAction } from "./actions";

const FILTERS: { label: string; value: ClassRegistrationStatus | "ALL" }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "All", value: "ALL" },
];

export default async function AdminStudentsPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "PENDING";
  const registrations = await getAdminClassRegistrations(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Students</h1>
      <p className="mt-2 text-sm text-slate-500">
        {registrations.length} registration{registrations.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full border border-ink/10 p-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "PENDING" ? "/admin/students" : `/admin/students?status=${filter.value}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeFilter === filter.value ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
            }`}
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
