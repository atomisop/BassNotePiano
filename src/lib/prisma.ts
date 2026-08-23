import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 removed the implicit "read the connection string out of
// schema.prisma's datasource block" behavior — the client now needs an
// explicit driver adapter wired with the connection string itself. This is
// the pooled connection (Neon's PgBouncer endpoint in production); the
// unpooled DIRECT_URL the `prisma` CLI uses for migrations lives in
// prisma.config.ts instead, not here.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Standard Next.js dev-mode singleton — prevents hot-reload from opening a
// fresh connection pool on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
