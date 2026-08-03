// Modulo puro di proposito: nessun import da un `.server`, cosi' resta
// utilizzabile ovunque senza trascinarsi dietro codice che gira solo sul server.

/**
 * Esito dell'abbonamento ai fini della gestione del piano.
 *
 * - `active`: l'abbonamento e' attivo e il piano va applicato/confermato.
 * - `ended`: l'abbonamento e' terminato e il negozio va riportato al piano gratuito.
 * - `ignore`: stato transitorio o irrilevante (PENDING, ACCEPTED), nessuna azione.
 */
export type SubscriptionOutcome = 'active' | 'ended' | 'ignore';

/**
 * Determina l'azione da intraprendere per un dato stato di abbonamento.
 *
 * ACTIVE → conferma/applica il piano
 * CANCELLED/EXPIRED/DECLINED/FROZEN → torna al piano gratuito
 * PENDING/ACCEPTED → ignora (ancora in approvazione)
 *
 * Qualsiasi altro stato (sconosciuto o futuro) → ignora: meglio non toccare
 * niente che non fare l'azione giusta.
 */
export function subscriptionOutcome(status: string): SubscriptionOutcome {
  const normalized = status.toUpperCase().trim();

  if (normalized === 'ACTIVE') {
    return 'active';
  }

  if (
    normalized === 'CANCELLED' ||
    normalized === 'EXPIRED' ||
    normalized === 'DECLINED' ||
    normalized === 'FROZEN'
  ) {
    return 'ended';
  }

  // PENDING, ACCEPTED, o qualsiasi stato sconosciuto/futuro.
  return 'ignore';
}
