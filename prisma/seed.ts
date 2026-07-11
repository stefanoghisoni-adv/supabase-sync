import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Seed plans
  const plans = [
    {
      name: 'free',
      displayName: 'Free Plan',
      price: 0,
      trialDays: 0,
      maxSyncJobs: 10,
      maxProducts: 100,
      maxCustomers: 100,
      enableAutoSync: false,
      enableCustomFields: false,
      enableInventorySync: false,
      enableOrderSync: false,
      enableWebhooks: false,
      prioritySupport: false,
    },
    {
      name: 'pro',
      displayName: 'Pro Plan',
      price: 29.99,
      trialDays: 14,
      maxSyncJobs: 100,
      maxProducts: 5000,
      maxCustomers: 5000,
      enableAutoSync: true,
      enableCustomFields: true,
      enableInventorySync: true,
      enableOrderSync: false,
      enableWebhooks: true,
      prioritySupport: false,
    },
    {
      name: 'business',
      displayName: 'Business Plan',
      price: 99.99,
      trialDays: 14,
      maxSyncJobs: 500,
      maxProducts: 50000,
      maxCustomers: 50000,
      enableAutoSync: true,
      enableCustomFields: true,
      enableInventorySync: true,
      enableOrderSync: true,
      enableWebhooks: true,
      prioritySupport: true,
    },
    {
      name: 'enterprise',
      displayName: 'Enterprise Plan',
      price: 299.99,
      trialDays: 30,
      maxSyncJobs: 999999,
      maxProducts: 999999,
      maxCustomers: 999999,
      enableAutoSync: true,
      enableCustomFields: true,
      enableInventorySync: true,
      enableOrderSync: true,
      enableWebhooks: true,
      prioritySupport: true,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
    console.log(`Created/Updated plan: ${plan.displayName}`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
