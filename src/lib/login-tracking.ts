import { prisma } from "@/lib/prisma";
import { lookupIpLocation } from "@/lib/geolocation";
import { sendNewLocationLoginAlert } from "@/lib/email";

/**
 * Logs a successful login and emails an alert if it's from a city/country
 * this account hasn't logged in from before. Deliberately doesn't alert on
 * an account's very first login ever — every login is "new" the first time,
 * so that comparison would just be noise on signup.
 */
export async function recordLoginAndDetectNewLocation(
  userId: string,
  email: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  const geo = await lookupIpLocation(ip);

  const totalPriorLogins = await prisma.loginEvent.count({ where: { userId } });
  const isFirstLoginEver = totalPriorLogins === 0;

  const seenBefore = geo.city
    ? await prisma.loginEvent.count({ where: { userId, city: geo.city, country: geo.country } })
    : ip
      ? await prisma.loginEvent.count({ where: { userId, ip } })
      : 0;

  const isNewLocation = !isFirstLoginEver && seenBefore === 0;

  await prisma.loginEvent.create({
    data: { userId, ip: geo.ip, city: geo.city, region: geo.region, country: geo.country, userAgent, isNewLocation },
  });

  if (isNewLocation) {
    await sendNewLocationLoginAlert(email, {
      city: geo.city,
      region: geo.region,
      country: geo.country,
      ip: geo.ip,
      when: new Date(),
    }).catch((err) => console.error("Failed to send new-location login alert:", err));
  }
}
