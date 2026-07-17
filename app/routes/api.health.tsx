import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';

// Health check pubblico. Ritorna solo lo stato di connessione al database
// come booleano — nessuna credenziale, nessun dettaglio di errore, nessun dato.
export async function loader(_args: LoaderFunctionArgs) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: 'ok', database: true });
  } catch (error) {
    console.error('[health] Database check failed:', error);
    return json({ status: 'degraded', database: false }, { status: 503 });
  }
}
