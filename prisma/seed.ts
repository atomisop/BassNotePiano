// Unlike Next (which auto-loads .env), a standalone tsx script doesn't —
// load it explicitly so DATABASE_URL is set whether this runs via
// `npm run prisma:seed` or Prisma's own `prisma db seed` hook.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
// Relative import, not the "@/*" alias — this script runs standalone via
// tsx, outside Next's compiler, which is the only place that alias is wired up.
import { SCALE_GROUPS } from "../src/lib/curriculum";

const prisma = new PrismaClient();

async function main() {
  for (const scale of SCALE_GROUPS) {
    await prisma.scaleGroup.upsert({
      where: { slug: scale.slug },
      update: {
        order: scale.order,
        code: scale.code,
        title: scale.title,
        kinitName: scale.kinitName,
        formula: scale.formula,
        priceCents: scale.priceCents,
      },
      create: {
        slug: scale.slug,
        order: scale.order,
        code: scale.code,
        title: scale.title,
        kinitName: scale.kinitName,
        formula: scale.formula,
        priceCents: scale.priceCents,
      },
    });
    console.log(`Seeded ${scale.code} — ${scale.title}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
