import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/db.server';

/**
 * Quale versione del codice sta rispondendo.
 *
 * I primi sette caratteri del commit, quelli che si leggono in `git log`: senza,
 * davanti a un comportamento che risulta gia' corretto nel codice non c'e' modo
 * di distinguere "il rimedio non funziona" da "il rimedio non e' ancora
 * arrivato". Non e' un'informazione riservata — il repository e' privato, e il
 * solo identificativo di un commit non dice nulla di cio' che contiene.
 */
function deployedCommit(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}

// Health check pubblico. Ritorna solo lo stato di connessione al database
// come booleano — nessuna credenziale, nessun dettaglio di errore, nessun dato.
export async function loader(_args: LoaderFunctionArgs) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: 'ok', database: true, commit: deployedCommit() });
  } catch (error) {
    console.error('[health] Database check failed:', error);
    return json(
      { status: 'degraded', database: false, commit: deployedCommit() },
      { status: 503 },
    );
  }
}
