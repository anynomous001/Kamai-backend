/**
 * Removes all data created by prisma/seed.ts. Scoped strictly to bakers
 * whose businessName starts with "TEST — " — every table seeded there
 * (customers, orders, payment_events, investments, inventory_items,
 * refresh_tokens) cascades on baker deletion, so a single deleteMany is
 * sufficient and cannot touch any non-tagged (real) baker's data.
 *
 * Run: pnpm db:seed:teardown
 */
import 'dotenv/config';
import { prisma } from '../src/shared/database/prisma.js';

const TEST_PREFIX = 'TEST — ';

async function main() {
  const targets = await prisma.baker.findMany({
    where: { businessName: { startsWith: TEST_PREFIX } },
    select: { id: true, businessName: true, displayId: true },
  });

  if (targets.length === 0) {
    console.log('No seeded test bakers found (nothing prefixed "TEST — "). Nothing to do.');
    return;
  }

  console.log(`Found ${targets.length} seeded test baker(s):`);
  for (const b of targets) {
    console.log(`  - ${b.displayId}  ${b.businessName}  (${b.id})`);
  }

  const result = await prisma.baker.deleteMany({
    where: { businessName: { startsWith: TEST_PREFIX } },
  });

  console.log(`\nDeleted ${result.count} baker(s) and all their cascaded rows (customers, orders, payment_events, investments, inventory_items, refresh_tokens).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
