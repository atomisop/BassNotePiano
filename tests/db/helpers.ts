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
