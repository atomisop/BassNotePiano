import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { notifyOpenedSlots } from "../../src/lib/slotWaitlist";

// Hourly: tell the first person waiting for a weekly time that it has opened up.
export const runSlotWaitlist = () =>
  runJob("slot-waitlist", async () => {
    const result = await notifyOpenedSlots(new Date());
    console.log(`Slot waitlist: told ${result.notified}, cleared ${result.cleared}.`);
    return { statusCode: 200 };
  });

export const handler = schedule("17 * * * *", async () => runSlotWaitlist());
