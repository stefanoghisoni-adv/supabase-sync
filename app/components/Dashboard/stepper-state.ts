export type StepState = 'complete' | 'active' | 'locked';

export interface DashboardStepStates {
  /** 1. Accesso all'account Supabase. */
  connectAccount: StepState;
  /** 2. Database scelto o creato, con le tabelle pronte. */
  connectDatabase: StepState;
  /** 3. Prima sincronizzazione. */
  sync: StepState;
}

/**
 * Avanzamento dei tre passi della dashboard.
 *
 * I due collegamenti sono distinti perche' lo sono anche nei fatti: si puo'
 * avere l'account collegato e nessun database scelto — e' lo stato in cui si
 * resta chiudendo l'app a meta' flusso. Il database collegato implica l'account:
 * se il secondo risulta fatto e il primo no, si crede al database, che e' il
 * passo piu' avanti.
 */
export function resolveStepStates(
  accountConnected: boolean,
  databaseConnected: boolean,
): DashboardStepStates {
  const account = accountConnected || databaseConnected;

  return {
    connectAccount: account ? 'complete' : 'active',
    connectDatabase: databaseConnected ? 'complete' : account ? 'active' : 'locked',
    sync: databaseConnected ? 'active' : 'locked',
  };
}
