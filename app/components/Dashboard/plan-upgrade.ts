// `lastSyncedPlan` null significa "nessuna sync completata": e' il flusso normale
// di primo utilizzo, non un cambio di piano da segnalare.
export function hasPlanChanged(
  currentPlan: string,
  lastSyncedPlan: string | null,
): boolean {
  if (!lastSyncedPlan) return false;
  return currentPlan !== lastSyncedPlan;
}

// Titolo dello step: dice che cosa copre, non che cosa manca. Dopo un cambio di
// piano il recupero parte da solo, quindi non c'e' piu' un'azione diversa da
// annunciare.
export function syncButtonLabel(opts: { customersEnabled: boolean }): string {
  return opts.customersEnabled ? 'Sincronizza prodotti e clienti' : 'Sincronizza prodotti';
}

export interface SyncCta {
  label: string;
  disabled: boolean;
  loading: boolean;
}

/**
 * Stato del pulsante di sincronizzazione.
 *
 * Il caso che qui conta piu' degli altri: a piano cambiato NON si dice
 * "Sincronizzazione completata" — non lo e', c'e' un allineamento in corso — e
 * non si chiede un clic, perche' il recupero (nuovo tetto prodotti, tabella
 * clienti creata e popolata) parte da solo. Quando finisce, `planChanged` torna
 * falso e il pulsante si assesta da se'.
 */
export function syncCtaState(opts: {
  blocked: boolean;
  inProgress: boolean;
  completed: boolean;
  planChanged: boolean;
}): SyncCta {
  if (opts.inProgress) {
    return { label: 'Sincronizzazione in corso…', disabled: true, loading: true };
  }
  // Mai sincronizzato su questa connessione (anche dopo un ricollegamento):
  // qui il primo avvio resta manuale.
  if (!opts.completed) {
    return { label: 'Avvia sincronizzazione', disabled: opts.blocked, loading: false };
  }
  if (opts.planChanged) {
    return { label: 'Aggiornamento in corso…', disabled: true, loading: true };
  }
  return { label: 'Sincronizzazione completata', disabled: true, loading: false };
}

// Finestra entro cui non si rinnesca il recupero: copre il tempo fra l'innesco
// e la comparsa del job "running", cosi' qualche ricarica ravvicinata della
// dashboard non fa partire piu' corse sovrapposte.
const CATCH_UP_COOLDOWN_MS = 60_000;

/**
 * Se innescare subito il recupero dopo un cambio di piano, invece di aspettare
 * il giro di sincronizzazione automatica.
 */
export function shouldTriggerPlanCatchUp(opts: {
  planChanged: boolean;
  syncInProgress: boolean;
  lastBulkStartedAt: Date | string | null;
  now?: number;
}): boolean {
  if (!opts.planChanged || opts.syncInProgress) return false;
  if (!opts.lastBulkStartedAt) return true;

  const now = opts.now ?? Date.now();
  const startedAt = new Date(opts.lastBulkStartedAt).getTime();
  if (Number.isNaN(startedAt)) return true;
  return now - startedAt >= CATCH_UP_COOLDOWN_MS;
}

// null = illimitato: per i confronti vale come infinito.
function cap(v: number | null): number {
  return v == null ? Number.POSITIVE_INFINITY : v;
}

function capLabel(v: number | null): string {
  return v == null ? 'senza limite' : String(v);
}

export interface PlanChangeBanner {
  tone: 'success' | 'warning';
  title: string;
  /** Un paragrafo per argomento: prodotti prima, clienti dopo. */
  messages: string[];
}

/**
 * Che cosa comporta il cambio di piano, nei termini che interessano al merchant:
 * quanti prodotti restano sincronizzabili e che fine fanno i clienti.
 *
 * Il tono e' warning appena qualcosa si restringe (tetto prodotti piu' basso o
 * clienti non piu' inclusi), success negli altri casi.
 */
export function planChangeBanner(opts: {
  currentMax: number | null;
  previousMax: number | null;
  customersEnabled: boolean;
  previousCustomersEnabled: boolean;
}): PlanChangeBanner {
  const productsDowngrade = cap(opts.currentMax) < cap(opts.previousMax);
  const customersGained = opts.customersEnabled && !opts.previousCustomersEnabled;
  const customersLost = !opts.customersEnabled && opts.previousCustomersEnabled;

  const messages: string[] = [
    productsDowngrade
      ? `Alcuni prodotti verranno rimossi per rispettare il limite del piano: ` +
        `${capLabel(opts.currentMax)} prodotti sincronizzabili.`
      : `La sincronizzazione rispetterà automaticamente i nuovi limiti del piano: ` +
        `${capLabel(opts.currentMax)} prodotti sincronizzabili.`,
  ];

  if (customersGained) {
    messages.push(
      'La tabella dei clienti che hanno acconsentito al marketing viene creata e ' +
        'popolata subito, senza che tu debba fare nulla: da qui in avanti si ' +
        'aggiorna da sola insieme alla sincronizzazione periodica dei prodotti.',
    );
  }

  if (customersLost) {
    messages.push(
      'La sincronizzazione dei clienti si interrompe. I dati già raccolti non ' +
        'vengono cancellati e restano nel tuo progetto, ma non verranno più ' +
        'aggiornati né potranno essere usati per il tracciamento.',
    );
  }

  const isDowngrade = productsDowngrade || customersLost;

  return {
    tone: isDowngrade ? 'warning' : 'success',
    title: isDowngrade ? 'Piano modificato' : 'Piano aggiornato',
    messages,
  };
}
