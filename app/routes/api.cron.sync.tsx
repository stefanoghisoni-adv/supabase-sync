import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';
import { syncQueue } from '~/lib/queue/queues.server';
import {
  processPeriodicSyncCheck,
  processInitialBulkSync,
  processManualSync,
} from '~/lib/workers/processors.server';

/**
 * Cron-triggered sync endpoint (replaces the long-running BullMQ worker on the
 * zero-cost stack: Vercel Free has no long-running processes).
 *
 * Invoked in GET with `Authorization: Bearer CRON_SECRET` by:
 * - Vercel Cron (daily safety run, vercel.json)
 * - GitHub Actions (every 30 min, .github/workflows/sync-cron.yml)
 *
 * On each run it (1) drains jobs the UI enqueued into BullMQ (manual /
 * initial-bulk / periodic) and (2) runs periodic checks for shops whose plan
 * interval has elapsed. A single failing shop/job never aborts the whole run.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const authHeader = request.headers.get('Authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { drained: 0, periodicChecks: 0, errors: [] as string[] };

  // 1. Drain jobs enqueued from the UI (manual-sync, initial-bulk-sync, periodic-sync-check)
  const pendingJobs = await syncQueue.getJobs(['waiting', 'delayed'], 0, 20);

  for (const job of pendingJobs) {
    try {
      if (job.data.type === 'manual-sync') {
        await processManualSync(job.data.shopId, job);
      } else if (job.data.type === 'initial-bulk-sync') {
        await processInitialBulkSync(job.data.shopId, job);
      } else if (job.data.type === 'periodic-sync-check') {
        await processPeriodicSyncCheck(job.data.shopId);
      } else {
        // Unknown/deferred job type (e.g. retry-failed-webhook): skip, leave queued
        continue;
      }
      await job.remove();
      results.drained++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Cron drain error for job ${job.id}:`, error);
      results.errors.push(`job ${job.id}: ${message}`);
      // The processor already recorded a 'failed' SyncJob; drop the job and move on
      await job.remove();
    }
  }

  // 2. Periodic check for shops whose plan interval has elapsed
  const shops = await prisma.shop.findMany({
    where: {
      uninstalledAt: null,
      supabaseConfig: { syncEnabled: true },
    },
    include: { supabaseConfig: true },
  });

  for (const shop of shops) {
    try {
      const plan = await prisma.plan.findUnique({
        where: { planName: shop.currentPlan },
      });
      if (!plan) continue;

      const lastCheck = await prisma.syncJob.findFirst({
        where: { shopId: shop.id, jobType: 'periodic_check', status: 'completed' },
        orderBy: { completedAt: 'desc' },
      });

      const intervalMs = plan.maxSyncFrequencyHours * 3600 * 1000;
      const due =
        !lastCheck?.completedAt ||
        Date.now() - lastCheck.completedAt.getTime() >= intervalMs;

      if (due) {
        await processPeriodicSyncCheck(shop.id);
        results.periodicChecks++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Cron periodic check error for shop ${shop.shopDomain}:`, error);
      results.errors.push(`shop ${shop.shopDomain}: ${message}`);
      // Continue with the next shop: the processor already recorded a 'failed' SyncJob
    }
  }

  return json({ ok: true, ...results });
}
