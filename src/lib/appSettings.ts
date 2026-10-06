import { prisma } from "@/lib/prisma";

import { AUTOMATIONS, type AutomationKey } from "@/lib/automationKeys";

export async function getAutomations(): Promise<Record<AutomationKey, boolean>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: AUTOMATIONS.map((a) => a.key) } } });
  const stored = new Map(rows.map((r) => [r.key, r.value === "1"]));
  return Object.fromEntries(AUTOMATIONS.map((a) => [a.key, stored.get(a.key) ?? false])) as Record<AutomationKey, boolean>;
}

export async function setAutomation(key: AutomationKey, enabled: boolean): Promise<void> {
  if (!AUTOMATIONS.some((a) => a.key === key)) throw new Error("Unknown setting.");
  await prisma.appSetting.upsert({ where: { key }, update: { value: enabled ? "1" : "0" }, create: { key, value: enabled ? "1" : "0" } });
}
