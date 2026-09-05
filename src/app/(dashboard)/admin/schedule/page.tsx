import { getAllClassSchedules } from "@/lib/classSchedule";
import { AdminScheduleManager } from "@/components/admin/AdminScheduleManager";
import { createClassScheduleAction, updateClassScheduleAction, setClassScheduleActiveAction } from "./actions";

export default async function AdminSchedulePage() {
  const schedules = await getAllClassSchedules();

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Weekly schedule</h1>
      <p className="mt-2 text-sm text-slate-500">
        The recurring windows students book classes into. Turning one off stops it from showing up as bookable —
        existing bookings and their history are never affected.
      </p>

      <div className="mt-6">
        <AdminScheduleManager
          schedules={schedules.map((s) => ({
            id: s.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            durationMin: s.durationMin,
            creditCost: s.creditCost,
            label: s.label,
            active: s.active,
          }))}
          onCreate={createClassScheduleAction}
          onUpdate={updateClassScheduleAction}
          onSetActive={setClassScheduleActiveAction}
        />
      </div>
    </div>
  );
}
