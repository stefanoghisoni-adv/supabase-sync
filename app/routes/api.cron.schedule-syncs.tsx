import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { schedulePeriodicSyncs } from '~/lib/queue/scheduler.server';

export async function action({ request }: ActionFunctionArgs) {
  // Verify cron secret (for external cron services like Vercel Cron)
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await schedulePeriodicSyncs();
    return json({ ok: true });
  } catch (error) {
    console.error('Scheduler error:', error);
    return json({ error: 'Internal error' }, { status: 500 });
  }
}
