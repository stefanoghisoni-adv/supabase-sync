import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';

// Marcatore di versione: cambia a ogni deploy che tocca questa route, così
// interrogando /api/health si conferma QUALE build è effettivamente live in
// produzione (utile per distinguere un deploy vecchio da uno aggiornato).
const HEALTH_VERSION = 'auth-diag-1';

// Health check pubblico. Ritorna lo stato di connessione al database e alcune
// informazioni di readiness dello schema — nessuna credenziale, nessun dato
// per-negozio (solo conteggi aggregati per stato di autorizzazione).
export async function loader(_args: LoaderFunctionArgs) {
  try {
    await prisma.$queryRaw`SELECT 1`;

    // La colonna shops.authorization esiste nel DB di produzione? Se una
    // migrazione non è stata applicata, questo lo rende evidente.
    const colRows = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shops' AND column_name = 'authorization'
      ) AS "exists"`;
    const authorizationColumn = colRows[0]?.exists ?? false;

    // Distribuzione aggregata dei valori di autorizzazione (nessun shop_domain).
    let authorizationCounts: Record<string, number> | null = null;
    if (authorizationColumn) {
      const grouped = await prisma.shop.groupBy({
        by: ['authorization'],
        _count: { _all: true },
      });
      authorizationCounts = Object.fromEntries(
        grouped.map((g) => [g.authorization, g._count._all]),
      );
    }

    return json({
      status: 'ok',
      database: true,
      version: HEALTH_VERSION,
      authorizationColumn,
      authorizationCounts,
    });
  } catch (error) {
    console.error('[health] Database check failed:', error);
    return json({ status: 'degraded', database: false }, { status: 503 });
  }
}
