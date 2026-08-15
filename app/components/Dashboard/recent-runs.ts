import { syncStatusBadge, tableCreationMessage, type StatusBadge } from './sync-log-format';
import type { Dictionary } from '~/lib/i18n/context';

/**
 * Le ultime corse, come si leggono nella card della dashboard.
 *
 * Logica pura, senza componenti: qui si decide cosa dice ogni riga, e il test
 * lo verifica senza montare niente.
 */

/** Quanto della corsa serve per scriverne una riga. */
export interface RecentRunInput {
  id: string;
  jobType: string;
  status: string;
  /** Data in ISO: la formattazione vuole il fuso del negozio e sta nel componente. */
  startedAt: string;
}

export interface RecentRunRow {
  id: string;
  badge: StatusBadge;
  /** Cosa e' successo, in tre parole. */
  label: string;
  startedAt: string;
}

/**
 * Come si chiama, per il merchant, ciascun tipo di corsa.
 *
 * Le richieste GDPR non compaiono: arrivano da Shopify, non sono
 * sincronizzazioni, e in un riquadro che si intitola "Ultime sincronizzazioni"
 * sarebbero fuori posto. Nel registro completo restano.
 */
const RUN_LABELS: Record<string, keyof Dictionary['dashboard']['recentRuns']['run']> = {
  initial_bulk: 'initial',
  periodic_check: 'periodic',
  webhook: 'webhook',
};

const HIDDEN_JOB_TYPES = new Set([
  'gdpr_data_request',
  'gdpr_redact',
  'gdpr_shop_redact',
]);

export function recentRunLabel(jobType: string, t: Dictionary): string {
  // Le creazioni di tabella hanno gia' una frase loro, la stessa del registro:
  // due modi di dire la stessa cosa nelle due pagine sarebbero uno di troppo.
  const creation = tableCreationMessage(jobType, t);
  if (creation) return creation;
  const key = RUN_LABELS[jobType];
  return key ? t.dashboard.recentRuns.run[key] : t.dashboard.recentRuns.run.generic;
}

/**
 * Le righe da mostrare, al massimo `limit`.
 *
 * L'ordine arriva gia' fatto da chi legge il database (dalla piu' recente): qui
 * si filtra e si taglia, non si riordina.
 */
export function recentRunRows(
  runs: RecentRunInput[],
  t: Dictionary,
  limit = 5,
): RecentRunRow[] {
  return runs
    .filter((run) => !HIDDEN_JOB_TYPES.has(run.jobType))
    .slice(0, limit)
    .map((run) => ({
      id: run.id,
      badge: syncStatusBadge(run.status, t),
      label: recentRunLabel(run.jobType, t),
      startedAt: run.startedAt,
    }));
}
