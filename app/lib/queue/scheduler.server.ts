import { getSyncQueue } from './queues.server';
import { prisma } from '~/db.server';

/**
 * Schedules repeating periodic-sync-check jobs for every active shop.
 *
 * The interval is derived from the shop's plan (maxSyncFrequencyHours).
 * A stable jobId prevents duplicate repeatable jobs across invocations.
 *
 * Note: BullMQ repeatable jobs require a running worker, so this scheduler
 * is only used in local development (`npm run worker`). In production it is
 * superseded by the Part 4 cron route, which computes due shops and runs the
 * processors inline on each invocation.
 */
export async function schedulePeriodicSyncs() {
  const syncQueue = await getSyncQueue();
  const shops = await prisma.shop.findMany({
    where: {
      uninstalledAt: null,
      supabaseConfig: {
        syncEnabled: true,
      },
    },
    include: {
      supabaseConfig: true,
    },
  });

  for (const shop of shops) {
    if (!shop.supabaseConfig) continue;

    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });

    if (!plan) continue;

    const intervalMs = plan.maxSyncFrequencyHours * 3600 * 1000;

    await syncQueue.add(
      `periodic-sync-${shop.id}`,
      {
        type: 'periodic-sync-check',
        shopId: shop.id,
      },
      {
        repeat: {
          every: intervalMs,
        },
        jobId: `periodic-sync-${shop.id}`, // Prevents duplicates
      }
    );

    console.log(
      `Scheduled periodic sync for shop ${shop.shopDomain} every ${plan.maxSyncFrequencyHours}h`
    );
  }
}

/**
 * Removes the repeatable periodic-sync job for a single shop.
 * Called when a shop disables sync or uninstalls the app.
 */
export async function unschedulePeriodicSync(shopId: string) {
  const syncQueue = await getSyncQueue();
  const repeatableJobs = await syncQueue.getRepeatableJobs();

  for (const job of repeatableJobs) {
    if (job.name === `periodic-sync-${shopId}`) {
      await syncQueue.removeRepeatableByKey(job.key);
      console.log(`Unscheduled periodic sync for shop ${shopId}`);
    }
  }
}
