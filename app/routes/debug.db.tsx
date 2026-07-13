import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const sessionCount = await prisma.session.count();
    const planCount = await prisma.plan.count();
    const shopCount = await prisma.shop.count();

    return json({
      ok: true,
      database_url: process.env.DATABASE_URL?.slice(0, 50) + '...',
      counts: { sessions: sessionCount, plans: planCount, shops: shopCount },
    });
  } catch (error: any) {
    return json({
      ok: false,
      error: error.message,
      database_url: process.env.DATABASE_URL?.slice(0, 50) + '...',
    }, { status: 500 });
  }
}
