import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { markAttendance } from "@/lib/classScheduleAdmin";
import { notifyAdmins } from "@/lib/adminNotifications";
import { formatEtDateTime } from "@/lib/classScheduleLabels";

const HOUR_MS = 3_600_000;

/**
 * A class nobody marked Present or No-show used to cost the student nothing.
 * Once it is `attendance.autoChargeHours` past its start it is charged as
 * attended (the same charge a No-show gets), and about a day before that the
 * admins are told which classes are about to be. Runs hourly, so each class
 * falls in the one-hour warning window once.
 */
export async function runAttendanceAutoCharge(now = new Date()): Promise<{ charged: number; warned: number }> {
  const hours = await getNumberSetting("attendance.autoChargeHours");
  if (hours <= 0) return { charged: 0, warned: 0 };

  const due = await prisma.classBooking.findMany({
    // Only classes that have just passed the cutoff: one an admin corrected back to unmarked long after the class must not be charged again the next hour.
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date(now.getTime() - hours * HOUR_MS), gt: new Date(now.getTime() - (hours + 72) * HOUR_MS) } },
    select: { id: true },
    take: 200,
  });
  let charged = 0;
  for (const booking of due) {
    try {
      await markAttendance(booking.id, "PRESENT");
      charged++;
    } catch (err) {
      console.error(`Auto-charge of booking ${booking.id} failed (non-blocking):`, err);
    }
  }

  // The warning window closes a day before the charge, and is one run wide.
  const warnHours = Math.max(hours - 24, 0);
  const soon = await prisma.classBooking.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date(now.getTime() - warnHours * HOUR_MS), gt: new Date(now.getTime() - (warnHours + 1) * HOUR_MS) },
    },
    select: { scheduledAt: true, student: { select: { name: true, email: true } } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  if (soon.length > 0) {
    const lines = soon.map((b) => `${b.student.name ?? b.student.email}, ${formatEtDateTime(b.scheduledAt)}`).join("; ");
    await notifyAdmins("UNMARKED_CLASSES", {
      type: "ADMIN_ALERT",
      title: `${soon.length} unmarked class${soon.length === 1 ? "" : "es"} will be charged as attended soon`,
      body: `${lines}. Mark each Present or No-show, or cancel it, before then.`,
      emailCategory: "classes",
      cta: { label: "Mark attendance", path: "/admin/schedule" },
    }).catch((err) => console.error("Unmarked-class alert failed (non-blocking):", err));
  }
  return { charged, warned: soon.length };
}
