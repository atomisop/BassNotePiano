import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { createNotification } from "../../src/lib/notifications";
import { runJob } from "../../src/lib/jobRun";
import { DISCORD_INVITE_URL, discordChannelUrl } from "../../src/lib/discord";
import { getBoolSetting } from "../../src/lib/siteSettings";
import { formatEtDateTime } from "../../src/lib/classScheduleLabels";

const HOUR_MS = 3_600_000;

// Every 15 minutes. Each booked class gets two reminders, once each: the day
// before and shortly before it starts. A class booked less than a day ahead
// skips the first one, since the student just chose that time.
export const handler = schedule("*/15 * * * *", async () =>
  runJob("class-reminders", async () => {
    const now = new Date();
    const sendDayBefore = await getBoolSetting("reminders.classDayBefore");
    const sendHourBefore = await getBoolSetting("reminders.classHourBefore");

    const dayBefore = await prisma.classBooking.findMany({
      where: {
        status: "SCHEDULED",
        reminder24At: null,
        scheduledAt: { gt: new Date(now.getTime() + 2 * HOUR_MS), lte: new Date(now.getTime() + 24 * HOUR_MS) },
      },
      select: { id: true, studentId: true, scheduledAt: true, createdAt: true },
    });

    for (const booking of dayBefore) {
      const bookedInsideWindow = booking.createdAt.getTime() > booking.scheduledAt.getTime() - 24 * HOUR_MS;
      await prisma.classBooking.update({ where: { id: booking.id }, data: { reminder24At: now } });
      if (bookedInsideWindow || !sendDayBefore) continue;
      await createNotification({
        userId: booking.studentId,
        type: "CLASS_REMINDER",
        title: "Your class is tomorrow",
        body: `${formatEtDateTime(booking.scheduledAt)}. We meet live on Discord.`,
        emailCategory: "reminders",
        cta: { label: "Open Discord", url: DISCORD_INVITE_URL },
      }).catch((err) => console.error("Class reminder (day before) failed (non-blocking):", err));
    }

    const soon = await prisma.classBooking.findMany({
      where: {
        status: "SCHEDULED",
        reminder1hAt: null,
        scheduledAt: { gt: now, lte: new Date(now.getTime() + HOUR_MS) },
      },
      select: { id: true, studentId: true, scheduledAt: true, discordChannelId: true },
    });

    for (const booking of soon) {
      await prisma.classBooking.update({ where: { id: booking.id }, data: { reminder1hAt: now, reminder24At: now } });
      if (!sendHourBefore) continue;
      const minutes = Math.max(1, Math.round((booking.scheduledAt.getTime() - now.getTime()) / 60_000));
      await createNotification({
        userId: booking.studentId,
        type: "CLASS_REMINDER",
        title: "Your class starts soon",
        body: `Starting in about ${minutes} minute${minutes === 1 ? "" : "s"}. Join your teacher on Discord.`,
        emailCategory: "reminders",
        cta: { label: "Join on Discord", url: booking.discordChannelId ? discordChannelUrl(booking.discordChannelId) : DISCORD_INVITE_URL },
      }).catch((err) => console.error("Class reminder (starting soon) failed (non-blocking):", err));
    }

    console.log(`Class reminders: ${dayBefore.length} day-before, ${soon.length} starting soon`);
    return { statusCode: 200 };
  }));
