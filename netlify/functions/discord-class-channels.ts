import { schedule } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { runJob } from "../../src/lib/jobRun";
import { OWNER_EMAIL } from "../../src/lib/adminNotifications";
import { createNotification } from "../../src/lib/notifications";
import { discordChannelUrl } from "../../src/lib/discord";
import { classChannelName, createClassChannel, deleteChannel, isGuildMember, moveToVoiceChannel, TEST_CHANNEL_KEY } from "../../src/lib/discordApi";
import { getBoolSetting, getNumberSetting } from "../../src/lib/siteSettings";
import { movedMarker, peopleToMove } from "../../src/lib/discordMove";

const MINUTE_MS = 60_000;
// How early a call opens and how long it stays after class are admin settings (Settings → Discord live classes). Defaults: 5 and 5.
const CLASS_MINUTES = 45;
// Someone who joins voice late is still pulled into their call for this long after the class starts.
const MOVE_RETRY_AFTER_START_MIN = 15;

/**
 * One in-app notice to the owner per reason, so a job that runs every two minutes does not repeat itself.
 * The marker is a small AppSetting row, cleared after a day.
 */
async function tellOwnerOnce(ownerId: string | undefined, marker: string, title: string, body: string, now: number): Promise<void> {
  if (!ownerId) return;
  const key = `discord_notice:${marker}`;
  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (existing && Number(existing.value) > now - 24 * 60 * MINUTE_MS) return;
  await prisma.appSetting.upsert({ where: { key }, update: { value: String(now) }, create: { key, value: String(now) } });
  await createNotification({ userId: ownerId, type: "CLASS_REMINDER", title, body }).catch((err) => console.error("Owner notice failed (non-blocking):", err));
}

// Every minute, so a call opens and closes, and people are pulled into it, within a minute of their time. Does nothing until the bot token is set, so it is safe to
// ship before Discord is fully set up.
export const handler = schedule("* * * * *", async () =>
  runJob("discord-class-channels", async () => {
    if (!process.env.DISCORD_BOT_TOKEN) {
      console.log("Discord class channels: no bot token yet, nothing to do");
      return { statusCode: 200 };
    }
    if (!(await getBoolSetting("discord.enabled"))) {
      console.log("Discord class channels: turned off in settings");
      return { statusCode: 200 };
    }
    const OPEN_BEFORE_MIN = await getNumberSetting("discord.openBeforeMinutes");
    const CLOSE_AFTER_MIN = await getNumberSetting("discord.closeAfterMinutes");
    const addOwner = await getBoolSetting("discord.addOwner");
    const notifyOwner = await getBoolSetting("discord.notifyOwner");
    const notifyStudents = await getBoolSetting("discord.notifyStudents");
    const autoMove = await getBoolSetting("discord.autoMove");
    const now = Date.now();
    let created = 0;
    let removed = 0;

    // 1. Make a private call for each class starting soon.
    const upcoming = await prisma.classBooking.findMany({
      where: {
        status: "SCHEDULED",
        discordChannelId: null,
        inPerson: false, // an in-person class has no call
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

    const owner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL, role: "ADMIN" }, select: { id: true, discordId: true } });
    // The owner can only be given a call they are actually in the server for, and a missing
    // Discord link means they are not added to the call at all. Say so instead of staying silent.
    const ownerInServer = addOwner && owner?.discordId ? await isGuildMember(owner.discordId).catch(() => false) : false;

    for (const members of Array.from(calls.values())) {
      try {
        const linked = members.filter((m) => m.student.discordId);
        const inServer: typeof linked = [];
        for (const m of linked) if (await isGuildMember(m.student.discordId as string)) inServer.push(m);
        if (inServer.length === 0) {
          // No call is made when nobody in the class can be put into it. Tell the owner once, with the reason.
          const why = linked.length === 0 ? "has not connected Discord" : "is not in the Discord server";
          await tellOwnerOnce(owner?.id, `skip:${members[0].id}`, "A class call was not opened", `${members.map((m) => m.student.name ?? "A student").join(", ")} ${why}, so there is no call to join. Ask them to connect Discord on the Lessons page.`, now);
          continue;
        }

        if (addOwner && !ownerInServer) {
          await tellOwnerOnce(
            owner?.id,
            `owner:${owner?.id ?? "none"}`,
            "You are not added to class calls",
            owner?.discordId ? "Your connected Discord account is not in the server, so class calls open without you." : "Connect your own Discord on the Lessons page, or class calls open without you.",
            now,
          );
        }
        const ids = Array.from(new Set([...inServer.map((m) => m.student.discordId as string), ...(ownerInServer && owner?.discordId ? [owner.discordId] : [])]));
        const channelId = await createClassChannel(
          classChannelName(inServer.map((m) => m.student.name ?? ""), members[0].scheduledAt),
          ids,
        );
        await prisma.classBooking.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { discordChannelId: channelId } });
        created++;

        if (notifyOwner && owner?.id) {
          await createNotification({
            userId: owner.id,
            type: "CLASS_REMINDER",
            title: "Your class call is open",
            body: `${inServer.map((m) => m.student.name ?? "Your student").join(", ")} can join now. Tap to enter the call.`,
            cta: { label: "Join on Discord", url: discordChannelUrl(channelId) },
          }).catch((err) => console.error("Owner class call notification failed (non-blocking):", err));
        }
        // Tell each student their call is open, with a link straight to it.
        for (const m of notifyStudents ? inServer : []) {
          await createNotification({
            userId: (await prisma.user.findFirst({ where: { discordId: m.student.discordId }, select: { id: true } }))?.id ?? "",
            type: "CLASS_REMINDER",
            title: "Your class call is open",
            body: "Your teacher is joining. Tap to enter your private call.",
            emailCategory: "reminders",
            cta: { label: "Join on Discord", url: discordChannelUrl(channelId) },
          }).catch((err) => console.error("Class call notification failed (non-blocking):", err));
        }
      } catch (err) {
        console.error("Discord class channel failed (non-blocking):", err);
      }
    }

    // 1b. Pull people into their call. Discord only lets the bot move someone who is already on a voice channel somewhere in
    // the server, so this is tried again on every run (every minute) from the moment the call opens until a little after
    // class starts: whoever joins voice, at any point in that time, is put into the call within a minute. Each person is
    // moved once and then left alone.
    if (autoMove) {
      const live = await prisma.classBooking.findMany({
        where: {
          status: "SCHEDULED",
          discordChannelId: { not: null },
          scheduledAt: { gte: new Date(now - MOVE_RETRY_AFTER_START_MIN * MINUTE_MS), lte: new Date(now + OPEN_BEFORE_MIN * MINUTE_MS) },
        },
        select: { discordChannelId: true, student: { select: { discordId: true } } },
      });
      const byChannel = new Map<string, string[]>();
      for (const b of live) {
        const channelId = b.discordChannelId as string;
        byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), ...(b.student.discordId ? [b.student.discordId] : [])]);
      }
      const calls = Array.from(byChannel.entries()).map(([channelId, studentDiscordIds]) => ({ channelId, studentDiscordIds }));
      const markers = calls.length
        ? await prisma.appSetting.findMany({ where: { key: { startsWith: "discord_moved:" }, updatedAt: { gt: new Date(now - 2 * 24 * 60 * MINUTE_MS) } }, select: { key: true } })
        : [];
      const targets = peopleToMove(calls, addOwner ? (owner?.discordId ?? null) : null, new Set(markers.map((m) => m.key)));
      for (const t of targets) {
        const result = await moveToVoiceChannel(t.discordId, t.channelId).catch(() => "failed" as const);
        if (result === "moved") {
          const key = movedMarker(t.channelId, t.discordId);
          await prisma.appSetting.upsert({ where: { key }, update: { value: String(now) }, create: { key, value: String(now) } });
          console.log(`Discord auto-move ${t.discordId}: moved`);
        } else if (result === "failed") {
          console.log(`Discord auto-move ${t.discordId}: failed`);
        }
        // "not_in_voice" is the normal wait: they have not opened Discord voice yet, so it is tried again next run.
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

    // The owner's visible test call, once its ten minutes are up.
    const test = await prisma.appSetting.findUnique({ where: { key: TEST_CHANNEL_KEY } });
    if (test) {
      const [channelId, expiresAt] = test.value.split("|");
      if (!expiresAt || Number(expiresAt) < now) {
        try {
          await deleteChannel(channelId);
          await prisma.appSetting.delete({ where: { key: TEST_CHANNEL_KEY } });
          removed++;
        } catch (err) {
          console.error("Discord test channel removal failed (non-blocking):", err);
        }
      }
    }

    await prisma.appSetting.deleteMany({
      where: { OR: [{ key: { startsWith: "discord_notice:" } }, { key: { startsWith: "discord_moved:" } }], updatedAt: { lt: new Date(now - 2 * 24 * 60 * MINUTE_MS) } },
    });

    console.log(`Discord class channels: ${created} created, ${removed} removed`);
    return { statusCode: 200 };
  }));
