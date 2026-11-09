import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { runAttendanceAutoCharge } from "../../src/lib/attendanceAutoCharge";

// Hourly. Charges classes nobody marked after the owner's chosen number of hours, and warns the admins a day before.
export const runAttendanceAutoChargeJob = () =>
  runJob("attendance-auto-charge", async () => {
    const result = await runAttendanceAutoCharge();
    console.log(`Attendance auto-charge: charged ${result.charged}, warned about ${result.warned}.`);
    return { statusCode: 200 };
  });

export const handler = schedule("5 * * * *", async () => runAttendanceAutoChargeJob());
