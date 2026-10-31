import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { notifyAdmins } from "@/lib/adminNotifications";

/**
 * Tells the owner when failed sign-ins across the whole site pass a limit they set (Settings > Security, 0 turns it off),
 * at most once an hour. The message gives a count only: no email addresses, so it cannot be used to learn who has an account.
 */

const MARKER = "security-alert:failed-logins";
const HOUR = 60 * 60 * 1000;
const pad = (ms: number) => String(ms).padStart(13, "0");

/** True for exactly one caller per hour: an update that only succeeds when the stored time is older than an hour. */
async function claimHourlyAlert(now: number): Promise<boolean> {
  const claimed = await prisma.appSetting.updateMany({ where: { key: MARKER, value: { lt: pad(now - HOUR) } }, data: { value: pad(now) } });
  if (claimed.count === 1) return true;
  try {
    await prisma.appSetting.create({ data: { key: MARKER, value: pad(now) } });
    return true;
  } catch {
    return false; // already claimed within the hour
  }
}

export async function maybeAlertFailedLogins(now = Date.now()): Promise<boolean> {
  try {
    const threshold = await getNumberSetting("security.failedLoginAlertThreshold");
    if (threshold <= 0) return false;
    const count = await prisma.failedLoginAttempt.count({ where: { createdAt: { gte: new Date(now - HOUR) } } });
    if (count < threshold) return false;
    if (!(await claimHourlyAlert(now))) return false;
    await notifyAdmins("FAILED_LOGIN_SPIKE", {
      type: "ADMIN_ALERT",
      title: "Many failed sign-in attempts",
      body: `${count} failed sign-in attempts in the last hour (your alert limit is ${threshold}). This could be someone guessing passwords. Accounts lock themselves after repeated wrong tries. You will not be told again for an hour.`,
      cta: { label: "Open settings", path: "/admin/settings" },
    });
    return true;
  } catch (err) {
    console.error("Failed-login alert failed (non-blocking):", err);
    return false;
  }
}
