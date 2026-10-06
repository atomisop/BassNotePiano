import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { runJob } from "../../src/lib/jobRun";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { classChannelName, createClassChannel, deleteChannel, isGuildMember } from "../../src/lib/discordApi";

const MINUTE_MS = 60_000;
const OPEN_BEFORE_MIN = 120; // a private channel appears two hours before the class
const CLOSE_AFTER_MIN = 20; // and goes away twenty minutes after it ends
const CLASS_MINUTES = 45;

// Every 10 minutes. Does nothing until the bot token is set, so it is safe to
// ship before Discord is fully set up.
export const handler = schedule("*/10 * * * *", async () =>
  runJob("discord-class-channels", async () => {
    if (!process.env.DISCORD_BOT_TOKEN) {
      console.log("Discord class channels: no bot token yet, nothing to do");
      return { statusCode: 200 };
    }
    const now = Date.now();
    let created = 0;
    let removed = 0;

    // 1. Make a private call for each class starting soon.
    const upcoming = await prisma.classBooking.findMany({
      where: {
        status: "SCHEDULED",
        discordChannelId: null,
        scheduledAt: { gt: new Date(now - 10 * MINUTE_MS), lte: new Date(now + OPEN_BEFORE_MIN * MINUTE_MS) },
      },
      select: {
        id: true,
        scheduledAt: true,
        familyBookingGroupId: true,
        student: { select: { name: true, discordId: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // A family class is one call for everyone in it.
    const calls = new Map<string, typeof upcoming>();
    for (const booking of upcoming) {
      const key = booking.familyBookingGroupId ?? booking.id;
      calls.set(key, [...(calls.get(key) ?? []), booking]);
    }

    const owner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL, role: "ADMIN" }, select: { discordId: true } });

    for (const members of Array.from(calls.values())) {
      try {
        const linked = members.filter((m) => m.student.discordId);
        if (linked.length === 0) continue;
        const inServer: typeof linked = [];
        for (const m of linked) if (await isGuildMember(m.student.discordId as string)) inServer.push(m);
        if (inServer.length === 0) continue;

        const ids = Array.from(new Set([...inServer.map((m) => m.student.discordId as string), ...(owner?.discordId ? [owner.discordId] : [])]));
        const channelId = await createClassChannel(
          classChannelName(inServer.map((m) => m.student.name ?? ""), members[0].scheduledAt),
          ids,
        );
        await prisma.classBooking.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { discordChannelId: channelId } });
        created++;
      } catch (err) {
        console.error("Discord class channel failed (non-blocking):", err);
      }
    }

    // 2. Remove calls for classes that are over or were canceled.
    const open = await prisma.classBooking.findMany({
      where: { discordChannelId: { not: null } },
      select: { id: true, status: true, scheduledAt: true, creditsSpent: true, discordChannelId: true },
    });
    const channelEnds = new Map<string, { ids: string[]; done: boolean }>();
    for (const b of open) {
      const channelId = b.discordChannelId as string;
      const minutes = CLASS_MINUTES * Math.max(1, Math.floor(b.creditsSpent / 2));
      const over = b.scheduledAt.getTime() + (minutes + CLOSE_AFTER_MIN) * MINUTE_MS < now;
      const entry = channelEnds.get(channelId) ?? { ids: [], done: true };
      entry.ids.push(b.id);
      // A channel closes when every class using it is over or canceled.
      entry.done = entry.done && (over || b.status === "CANCELED");
      channelEnds.set(channelId, entry);
    }
    for (const [channelId, entry] of Array.from(channelEnds.entries())) {
      if (!entry.done) continue;
      try {
        await deleteChannel(channelId);
        await prisma.classBooking.updateMany({ where: { id: { in: entry.ids } }, data: { discordChannelId: null } });
        removed++;
      } catch (err) {
        console.error("Discord class channel removal failed (non-blocking):", err);
      }
    }

    console.log(`Discord class channels: ${created} created, ${removed} removed`);
    return { statusCode: 200 };
  }));
