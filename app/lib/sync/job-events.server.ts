/**
 * Persistenza del dettaglio di una sincronizzazione.
 *
 * Regola che vale per tutto il file: il dettaglio e' accessorio. Se scriverlo
 * fallisce, la sincronizzazione deve comunque arrivare in fondo con i suoi
 * totali — un log incompleto e' un fastidio, una sync interrotta e' un danno.
 * Per questo ogni accesso al database sta dentro un try/catch che si limita ad
 * avvisare.
 */
import { prisma } from '../../db.server';
import {
  createEventBuffer,
  MAX_JOBS_WITH_DETAIL,
  type SyncEventBuffer,
  type SyncEventCounters,
} from './job-events';

export interface SyncEventCollector extends SyncEventBuffer {
  /**
   * Scrive le righe raccolte finora e restituisce i contatori da salvare su
   * SyncJob. Svuota il raccoglitore, quindi puo' essere chiamata due volte
   * (percorso completato e percorso fallito) senza duplicare nulla.
   */
  flush(syncJobId: string): Promise<SyncEventCounters>;
}

export function createEventCollector(
  maxPerEntity?: number,
): SyncEventCollector {
  const buffer = createEventBuffer(maxPerEntity);

  return {
    ...buffer,
    async flush(syncJobId) {
      const counters = buffer.counters();
      const rows = buffer.drain();
      if (rows.length === 0) return counters;

      try {
        await prisma.syncJobEvent.createMany({
          data: rows.map((row) => ({
            syncJobId,
            entity: row.entity,
            action: row.action,
            shopifyId: row.shopifyId,
            variantId: row.variantId,
            label: row.label,
            sublabel: row.sublabel,
          })),
        });
      } catch (error) {
        console.warn('Salvataggio del dettaglio della sincronizzazione fallito:', error);
      }

      // I contatori si restituiscono comunque: sono il totale vero della corsa,
      // e restano validi anche se le righe non si sono scritte.
      return counters;
    },
  };
}

/**
 * Cancella il dettaglio delle corse che non compaiono piu' nella tab Logs.
 *
 * Il modal si apre da quella lista: oltre le ultime MAX_JOBS_WITH_DETAIL corse
 * non c'e' nessun punto dell'app da cui raggiungere quelle righe, quindi
 * conservarle vorrebbe dire far crescere la tabella all'infinito per niente.
 */
export async function pruneOldEvents(shopId: string): Promise<void> {
  try {
    const recentJobs = await prisma.syncJob.findMany({
      where: { shopId },
      orderBy: { startedAt: 'desc' },
      take: MAX_JOBS_WITH_DETAIL,
      select: { id: true },
    });

    await prisma.syncJobEvent.deleteMany({
      where: {
        // Il vincolo sullo shop e' quello che conta: senza, un `notIn` su una
        // lista di id cancellerebbe il dettaglio di tutti gli altri negozi.
        syncJob: { shopId },
        syncJobId: { notIn: recentJobs.map((job) => job.id) },
      },
    });
  } catch (error) {
    console.warn('Potatura del dettaglio delle vecchie sincronizzazioni fallita:', error);
  }
}
