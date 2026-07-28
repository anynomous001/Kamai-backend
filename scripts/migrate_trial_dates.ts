import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const bakers = await prisma.baker.findMany({
    where: {
      OR: [
        { trialStartDate: null },
        { trialEndDate: null }
      ]
    }
  });

  for (const baker of bakers) {
    const trialStartDate = baker.createdAt;
    const trialEndDate = new Date(trialStartDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    await prisma.baker.update({
      where: { id: baker.id },
      data: { trialStartDate, trialEndDate }
    });
    console.log(`Updated baker ${baker.id}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
