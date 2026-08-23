// Prisma 7's config file is evaluated before the CLI auto-loads .env the
// way schema.prisma always did — load it explicitly here, first, or
// env("DIRECT_URL") below throws before the file even finishes evaluating.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved connection URLs and CLI-only config (seed command, schema
// path) out of schema.prisma's datasource block entirely — see the comment
// above `datasource db` in prisma/schema.prisma for why DIRECT_URL (not
// DATABASE_URL) is the one used here specifically. This file is read by the
// `prisma` CLI (migrate/studio/db) only; the running app's own PrismaClient
// gets its pooled connection separately, via the driver adapter constructed
// in src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
