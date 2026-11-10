import { schedule } from "@netlify/functions";
import { runJob } from "../../src/lib/jobRun";
import { runCatchUps } from "../../src/lib/jobCatchUp";
import { runCreditExpiry } from "./credit-expiry";
import { runPaymentPlanReservations } from "./payment-plan-reservations";
import { runAdminDailySummary } from "./admin-daily-summary";
import { runAutoApprovals } from "./auto-approvals";
import { runMailChainProbe } from "./mail-chain-probe";

// Every 10 minutes: runs a daily job that was missed (see src/lib/jobCatchUp.ts). Quiet when nothing was missed. It has its own run
// so a slow catch-up never eats the watchdog's time, and it is itself watched (JOB_MAX_SILENCE_HOURS).
export const runJobCatchUp = () =>
  runJob("job-catch-up", async () => {
    const ran = await runCatchUps({
      "credit-expiry": runCreditExpiry,
      "payment-plan-reservations": runPaymentPlanReservations,
      "admin-daily-summary": runAdminDailySummary,
      "auto-approvals": runAutoApprovals,
      "mail-chain-probe": runMailChainProbe,
    });
    console.log(ran.length === 0 ? "Job catch-up: nothing missed." : `Job catch-up: ran ${ran.join(", ")} late.`);
    return { statusCode: 200 };
  });

export const handler = schedule("*/10 * * * *", async () => runJobCatchUp());
