export type StepState = 'complete' | 'active' | 'locked';

export interface DashboardStepStates {
  /** 1. Accesso all'account Supabase. */
  connectAccount: StepState;
  /** 2. Database scelto o creato, con le tabelle pronte. */
  connectDatabase: StepState;
  /** 3. Controllo delle altre fonti di eventi gia' attive sul negozio. */
  trackingCheck: StepState;
  /** 4. Infrastruttura server side: ce l'ha, o gliela serve. */
  serverSide: StepState;
  /** 5. Piano scelto o confermato, e prima sincronizzazione: e' la fine. */
  plan: StepState;
}

export interface StepInput {
  accountConnected: boolean;
  databaseConnected: boolean;
  /** Il controllo delle fonti di eventi ha dato una risposta. */
  trackingChecked: boolean;
  /** Il piano e' stato scelto o confermato e la sincronizzazione e' partita. */
  planConfirmed: boolean;
  /** Il merchant ha risposto sulla propria infrastruttura. */
  serverSideAnswered: boolean;
}

/**
 * Avanzamento dei cinque passi della dashboard.
 *
 * I due collegamenti sono distinti perche' lo sono anche nei fatti: si puo'
 * avere l'account collegato e nessun database scelto — e' lo stato in cui si
 * resta chiudendo l'app a meta' flusso. Il database collegato implica l'account:
 * se il secondo risulta fatto e il primo no, si crede al database, che e' il
 * passo piu' avanti.
 *
 * Da li' in poi ogni passo si apre quando il precedente e' concluso: nessuno di
 * essi ha senso da solo — non si parla di infrastruttura prima di sapere cosa
 * gia' trasmette dati, e non si sceglie un piano prima di sapere che
 * infrastruttura si ha.
 *
 * Il piano e' l'ultimo perche' e' la fine vera: confermandolo parte la
 * sincronizzazione, e da quel momento l'app lavora. Tutto cio' che viene prima
 * serve a sapere cosa si sta comprando.
 */
export function resolveStepStates(input: StepInput): DashboardStepStates {
  const account = input.accountConnected || input.databaseConnected;

  const state = (done: boolean, previousDone: boolean): StepState =>
    done ? 'complete' : previousDone ? 'active' : 'locked';

  return {
    connectAccount: account ? 'complete' : 'active',
    connectDatabase: state(input.databaseConnected, account),
    trackingCheck: state(input.trackingChecked, input.databaseConnected),
    serverSide: state(
      input.serverSideAnswered,
      input.databaseConnected && input.trackingChecked,
    ),
    plan: state(
      input.planConfirmed,
      input.databaseConnected && input.trackingChecked && input.serverSideAnswered,
    ),
  };
}

/** Tutti e cinque conclusi: la configurazione non ha piu' niente da chiedere. */
export function allStepsComplete(steps: DashboardStepStates): boolean {
  return Object.values(steps).every((state) => state === 'complete');
}
