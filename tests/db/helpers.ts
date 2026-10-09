import { vi } from "vitest";
import { prisma } from "@/lib/prisma";

/** One unique tag per test file run, so rows made by a test can be found and removed again. */
export const newTag = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function makeUser(tag: string, name: string, extra: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { email: `${tag}-${name.toLowerCase().replace(/\W+/g, "")}@example.com`, name, passwordHash: "x", ...extra },
  });
}

export const day = 86_400_000;
export { prisma, vi };

/**
 * A fresh, valid-looking US number for every call (real area codes, a legal exchange, never a 555 or filler
 * number), so tests never collide with rows left from earlier runs and always pass the realness check.
 */
const AREA_CODES = ["212", "310", "415", "617", "202", "305", "404", "312", "702", "206", "347", "718"];
export function freshPhone(): string {
  const area = AREA_CODES[Math.floor(Math.random() * AREA_CODES.length)];
  let exchange = "";
  do exchange = `${2 + Math.floor(Math.random() * 8)}${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`;
  while (exchange === "555" || exchange.endsWith("11"));
  const line = Math.floor(1000 + Math.random() * 9000).toString();
  return `+1${area}${exchange}${line}`;
}
