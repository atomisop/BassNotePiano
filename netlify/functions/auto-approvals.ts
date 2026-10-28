import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { runJob } from "../../src/lib/jobRun";
import { getAutomations } from "../../src/lib/appSettings";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { approveNextScale, getNextApproval } from "../../src/lib/scaleApproval";
import { approveClassRegistration } from "../../src/lib/classRegistration";

// Daily at 13:00 UTC. Does only what the owner switched on, and does nothing
// at all while both switches are off (the default).
// The job body is exported so the catch-up (src/lib/jobCatchUp.ts) can run it when a scheduled run was missed.
export const runAutoApprovals = () =>
  runJob("auto-approvals", async () => {
    const settings = await getAutomations();
    let scales = 0;
    let applications = 0;

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

    if (settings.auto_approve_applications) {
      const owner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL, role: "ADMIN" }, select: { id: true } });
      if (owner) {
        const pending = await prisma.classRegistration.findMany({ where: { status: "PENDING" }, select: { id: true } });
        for (const registration of pending) {
          try {
            await approveClassRegistration(registration.id, owner.id);
            applications++;
          } catch (err) {
            console.error(`Auto approval failed for application ${registration.id} (non-blocking):`, err);
          }
        }
      }
    }

    console.log(`Auto approvals: ${scales} scales released, ${applications} applications approved`);
    return { statusCode: 200 };
  });

export const handler = schedule("0 13 * * *", async () => runAutoApprovals());
