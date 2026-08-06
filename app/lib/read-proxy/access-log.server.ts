import { prisma } from '~/db.server';

/**
 * Esito di una lettura di dati personali attraverso il proxy.
 *
 * Sono etichette e non numeri: chi legge il registro fra sei mesi deve capire
 * cosa e' successo senza aprire il codice.
 */
export type AccessOutcome =
  | 'allowed'
  | 'denied_no_token'
  | 'denied_invalid_token'
  | 'denied_not_configured'
  | 'denied_suspended'
  | 'denied_table'
  | 'denied_consent'
  | 'upstream_error';

export interface AccessLogEntry {
  /** Null quando il token non porta a nessun negozio. */
  shopId: string | null;
  outcome: AccessOutcome;
  /** Lo status restituito al chiamante. */
  status: number;
}

/**
 * Registra un accesso ai dati personali dei clienti.
 *
 * Best effort per scelta: se la scrittura del registro fallisce, la lettura e'
 * gia' avvenuta e negarla a posteriori non la annulla — restituire un errore al
 * tracciamento del merchant per un log mancato sarebbe un danno senza rimedio.
 * L'errore finisce a console, dove lo raccoglie la piattaforma.
 */
export async function logCustomerDataAccess(entry: AccessLogEntry): Promise<void> {
  try {
    await prisma.customerDataAccessLog.create({
      data: {
        shopId: entry.shopId,
        outcome: entry.outcome,
        status: entry.status,
      },
    });
  } catch (error) {
    console.error(
      '[read-proxy] registro accessi non scritto:',
      error instanceof Error ? error.message : 'errore sconosciuto',
    );
  }
}

/**
 * Quanto si conserva il registro.
 *
 * Un anno: abbastanza da coprire un'indagine su un incidente scoperto in
 * ritardo, poco abbastanza da non diventare a sua volta un archivio da
 * proteggere per sempre.
 */
export const ACCESS_LOG_RETENTION_DAYS = 365;

export function accessLogCutoff(now: Date): Date {
  return new Date(now.getTime() - ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Elimina le righe piu' vecchie della finestra di conservazione.
 *
 * Restituisce quante ne ha tolte. Anche qui best effort: la potatura non deve
 * far fallire il giro che la ospita.
 */
export async function pruneAccessLog(now: Date = new Date()): Promise<number> {
  try {
    const { count } = await prisma.customerDataAccessLog.deleteMany({
      where: { createdAt: { lt: accessLogCutoff(now) } },
    });
    return count;
  } catch (error) {
    console.error(
      '[read-proxy] potatura del registro accessi fallita:',
      error instanceof Error ? error.message : 'errore sconosciuto',
    );
    return 0;
  }
}
