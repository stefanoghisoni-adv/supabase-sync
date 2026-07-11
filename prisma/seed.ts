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
        maxProducts: 100,
        maxCustomers: 0,
        maxSyncFrequencyHours: 24,
        customFieldsLimit: 3,
        supportLevel: 'community',
        customersSyncEnabled: false,
      },
      {
        planName: 'pro',
        priceMonthly: 29,
        priceYearly: 290,
        maxProducts: 1000,
        maxCustomers: 5000,
        maxSyncFrequencyHours: 6,
        customFieldsLimit: 10,
        supportLevel: 'email',
        customersSyncEnabled: true,
      },
      {
        planName: 'business',
        priceMonthly: 99,
        priceYearly: 990,
        maxProducts: 10000,
        maxCustomers: 50000,
        maxSyncFrequencyHours: 1,
        customFieldsLimit: 50,
        supportLevel: 'priority',
        customersSyncEnabled: true,
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
