import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';

// Marcatore di versione: cambia a ogni deploy che tocca questa route, così
// interrogando /api/health si conferma QUALE build è effettivamente live in
// produzione (utile per distinguere un deploy vecchio da uno aggiornato).
const HEALTH_VERSION = 'auth-diag-3';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Health check pubblico + diagnostica di readiness dello schema. Ogni controllo
// è isolato: un fallimento in uno step NON maschera gli altri, così si vede
// esattamente QUALE boundary rompe (connettività / colonna / distribuzione).
export async function loader(_args: LoaderFunctionArgs) {
  const result: Record<string, unknown> = {
    status: 'ok',
    version: HEALTH_VERSION,
  };

  // Step 1 — connettività di base.
  try {
    await prisma.$queryRaw`SELECT 1`;
    result.database = true;
  } catch (e) {
    return json(
      { ...result, status: 'degraded', database: false, dbError: errMsg(e) },
      { status: 503 },
    );
  }

  // Step 2 — la colonna shops.authorization esiste nel DB di produzione?
  try {
    const colRows = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shops' AND column_name = 'authorization'
      ) AS "exists"`;
    result.authorizationColumn = colRows[0]?.exists ?? false;
  } catch (e) {
    result.authorizationColumn = null;
    result.columnCheckError = errMsg(e);
  }

  // Step 3 — distribuzione aggregata dei valori (nessun shop_domain).
  try {
    const grouped = await prisma.shop.groupBy({
      by: ['authorization'],
      _count: { _all: true },
    });
    result.authorizationCounts = Object.fromEntries(
      grouped.map((g) => [g.authorization, g._count._all]),
    );
  } catch (e) {
    result.authorizationCounts = null;
    result.countsError = errMsg(e);
  }

  return json(result);
}
