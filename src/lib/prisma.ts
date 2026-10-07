import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton, prevents hot-reload from opening a
// fresh connection pool on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
