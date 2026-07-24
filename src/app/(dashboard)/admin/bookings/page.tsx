import Link from "next/link";
import type { LessonBookingStatus } from "@prisma/client";
import { getAdminBookings } from "@/lib/lessons";
import { AdminBookingsQueue } from "@/components/admin/AdminBookingsQueue";
import { completeBookingAction, cancelBookingAction } from "./actions";

const FILTERS: { label: string; value: LessonBookingStatus | "ALL" }[] = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Canceled", value: "CANCELED" },
  { label: "All", value: "ALL" },
];

export default async function AdminBookingsPage({ searchParams }: { searchParams: { status?: string } }) {
  const requested = searchParams.status?.toUpperCase();
  const activeFilter = FILTERS.find((f) => f.value === requested)?.value ?? "SCHEDULED";
  const bookings = await getAdminBookings(activeFilter === "ALL" ? undefined : activeFilter);
  const activeLabel = FILTERS.find((f) => f.value === activeFilter)!.label;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Lesson bookings</h1>
      <p className="mt-2 text-sm text-slate-500">
        {bookings.length} booking{bookings.length === 1 ? "" : "s"} · {activeLabel.toLowerCase()}
      </p>

      <div className="mt-6 flex w-fit flex-wrap gap-1.5 rounded-full border border-white/10 p-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "SCHEDULED" ? "/admin/bookings" : `/admin/bookings?status=${filter.value}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeFilter === filter.value ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <AdminBookingsQueue
          bookings={bookings}
          onComplete={completeBookingAction}
          onCancel={cancelBookingAction}
          emptyMessage={activeFilter === "SCHEDULED" ? "Nothing scheduled." : `No ${activeLabel.toLowerCase()} bookings.`}
        />
      </div>
    </div>
  );
}
