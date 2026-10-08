import { prisma } from "@/lib/prisma";
import {
  SETTING_BY_KEY,
  SETTING_DEFS,
  parseSetting,
  serializeSetting,
  storageKeyOf,
  type SettingValue,
} from "@/lib/siteSettingsDefs";

// Settings rarely change and are read on hot paths (every booking), so a server
// keeps what it read for a few seconds. Saving clears this server's copy at once;
// other servers catch up within the TTL.
const TTL_MS = 10_000;
let cache: { at: number; values: Map<string, SettingValue> } | null = null;

export function clearSettingsCache(): void {
  cache = null;
}

/** Every setting's current value, keyed by its definition key. */
export async function getAllSettings(): Promise<Map<string, SettingValue>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const rows = await prisma.appSetting.findMany({ where: { key: { in: SETTING_DEFS.map(storageKeyOf) } } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const values = new Map<string, SettingValue>();
  for (const def of SETTING_DEFS) values.set(def.key, parseSetting(def, stored.get(storageKeyOf(def))));
  cache = { at: Date.now(), values };
  return values;
}

function def(key: string) {
  const d = SETTING_BY_KEY[key];
  if (!d) throw new Error(`Unknown setting: ${key}`);
  return d;
}

export async function getBoolSetting(key: string): Promise<boolean> {
  const d = def(key);
  if (d.type !== "toggle") throw new Error(`${key} is not a toggle`);
  return (await getAllSettings()).get(key) as boolean;
}

export async function getNumberSetting(key: string): Promise<number> {
  const d = def(key);
  if (d.type !== "number") throw new Error(`${key} is not a number`);
  return (await getAllSettings()).get(key) as number;
}

export async function getTextSetting(key: string): Promise<string> {
  const d = def(key);
  if (d.type !== "text") throw new Error(`${key} is not text`);
  return (await getAllSettings()).get(key) as string;
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const d = def(key);
  const stored = serializeSetting(d, value);
  await prisma.appSetting.upsert({ where: { key: storageKeyOf(d) }, update: { value: stored }, create: { key: storageKeyOf(d), value: stored } });
  clearSettingsCache();
}

export async function resetSetting(key: string): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: storageKeyOf(def(key)) } });
  clearSettingsCache();
}
