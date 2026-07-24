// `lastSyncedPlan` null significa "nessuna sync completata": e' il flusso normale
// di primo utilizzo, non un cambio di piano da segnalare.
export function hasPlanChanged(
  currentPlan: string,
  lastSyncedPlan: string | null,
): boolean {
  if (!lastSyncedPlan) return false;
  return currentPlan !== lastSyncedPlan;
}

export function syncButtonLabel(opts: {
  planChanged: boolean;
  customersEnabled: boolean;
}): string {
  // Dopo un cambio di piano l'etichetta comunica il beneficio principale
  // dell'upgrade, anche se l'azione recupera pure i prodotti oltre il vecchio tetto.
  if (opts.planChanged && opts.customersEnabled) return 'Sincronizza clienti';
  if (opts.customersEnabled && !opts.planChanged) return 'Sincronizza prodotti e clienti';
  return 'Sincronizza prodotti';
}

// null = illimitato: per i confronti vale come infinito.
function cap(v: number | null): number {
  return v == null ? Number.POSITIVE_INFINITY : v;
}

function capLabel(v: number | null): string {
  return v == null ? 'senza limite' : String(v);
}

export function planChangeBanner(opts: {
  currentMax: number | null;
  previousMax: number | null;
  customersEnabled: boolean;
}): { tone: 'success' | 'warning'; title: string; message: string } {
  const isDowngrade = cap(opts.currentMax) < cap(opts.previousMax);

  if (isDowngrade) {
    return {
      tone: 'warning',
      title: 'Piano modificato',
      message:
        `Alcuni prodotti verranno rimossi per rispettare il limite del piano: ` +
        `${capLabel(opts.currentMax)} prodotti sincronizzabili.`,
    };
  }

  const clienti = opts.customersEnabled
    ? ' Ora è disponibile anche una nuova tabella per i clienti che hanno acconsentito al marketing.'
    : '';

  return {
    tone: 'success',
    title: 'Piano aggiornato',
    message:
      `La sincronizzazione rispetterà automaticamente i nuovi limiti del piano: ` +
      `${capLabel(opts.currentMax)} prodotti sincronizzabili.${clienti}`,
  };
}
