import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Temporaneamente abilitato in production per debug
  // if (process.env.NODE_ENV === 'production') {
  //   throw new Response('Not Found', { status: 404 });
  // }

  try {
    const sessionCount = await prisma.session.count();
    const planCount = await prisma.plan.count();
    const shopCount = await prisma.shop.count();

    // Estrai solo l'host senza credenziali
    let dbHost = 'unknown';
    try {
      if (process.env.DATABASE_URL) {
        dbHost = new URL(process.env.DATABASE_URL).host;
      }
    } catch {}

    return json({
      ok: true,
      db_host: dbHost,
      counts: { sessions: sessionCount, plans: planCount, shops: shopCount },
    });
  } catch (error: any) {
    console.error('[debug.db] Database error:', error);
    return json({
      ok: false,
      error: 'Database connection failed',
      error_code: error.code || 'UNKNOWN',
    }, { status: 500 });
  }
}
