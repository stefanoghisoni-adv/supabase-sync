import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding plans...');

  await prisma.plan.createMany({
    data: [
      {
        planName: 'free',
        priceMonthly: 0,
        priceYearly: 0,
        maxProducts: 50,
        maxCustomers: 0,
        maxSyncFrequencyHours: 24,
        customFieldsLimit: 3,
        supportLevel: 'community',
        customersSyncEnabled: false,
        trialDays: 14,
      },
      {
        planName: 'pro',
        priceMonthly: 29,
        priceYearly: 290,
        maxProducts: 100,
        maxCustomers: 5000,
        maxSyncFrequencyHours: 6,
        customFieldsLimit: 10,
        supportLevel: 'email',
        customersSyncEnabled: true,
        trialDays: null,
      },
      {
        planName: 'business',
        priceMonthly: 99,
        priceYearly: 990,
        maxProducts: 400,
        maxCustomers: 50000,
        maxSyncFrequencyHours: 1,
        customFieldsLimit: 50,
        supportLevel: 'priority',
        customersSyncEnabled: true,
        trialDays: null,
      },
      {
        planName: 'enterprise',
        priceMonthly: 299,
        priceYearly: 2990,
        maxProducts: null,
        maxCustomers: null,
        maxSyncFrequencyHours: 0.5,
        customFieldsLimit: null,
        supportLevel: 'dedicated',
        customersSyncEnabled: true,
        trialDays: null,
      },
      {
        // Piano interno senza costi, senza limiti, tutto sbloccato.
        // Non compare tra le opzioni in Impostazioni: assegnabile solo dall'owner.
        planName: 'lifetime',
        priceMonthly: 0,
        priceYearly: 0,
        maxProducts: null,
        maxCustomers: null,
        maxSyncFrequencyHours: 0.5,
        customFieldsLimit: null,
        supportLevel: 'dedicated',
        customersSyncEnabled: true,
        trialDays: null,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Plans seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
