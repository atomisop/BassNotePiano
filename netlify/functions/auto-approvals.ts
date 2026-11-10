import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { runJob } from "../../src/lib/jobRun";
import { getAutomations } from "../../src/lib/appSettings";
import { approveNextScale, getNextApproval } from "../../src/lib/scaleApproval";

// Daily at 13:00 UTC. Does only what the owner switched on, and does nothing
// at all while the switch is off (the default). Class applications used to be
// approved here too; they were removed (2026-11-09), so only scales remain.
// The job body is exported so the catch-up (src/lib/jobCatchUp.ts) can run it when a scheduled run was missed.
export const runAutoApprovals = () =>
  runJob("auto-approvals", async () => {
    const settings = await getAutomations();
    let scales = 0;

    if (settings.auto_approve_scales) {
      const students = await prisma.user.findMany({
        where: {
          role: "STUDENT",
          OR: [{ hasCurriculumAccess: true }, { paymentPlans: { some: { status: "ACTIVE", installmentsPaid: { gte: 1 } } } }],
        },
        select: { id: true },
      });
      for (const student of students) {
        try {
          const next = await getNextApproval(student.id);
          if (next.state !== "READY") continue;
          await approveNextScale(student.id);
          scales++;
        } catch (err) {
          console.error(`Auto scale release failed for ${student.id} (non-blocking):`, err);
        }
      }
    }

    console.log(`Auto approvals: ${scales} scales released`);
    return { statusCode: 200 };
  });

export const handler = schedule("0 13 * * *", async () => runAutoApprovals());
