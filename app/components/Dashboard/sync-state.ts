export type SyncState = 'idle' | 'in_progress' | 'completed';

interface JobLike {
  jobType: string;
  status: string;
  startedAt: Date | string;
}

/**
 * Stato della sincronizzazione iniziale/manuale, LEGATO ALLA CONNESSIONE CORRENTE.
 *
 * Considera solo i job `initial_bulk` avviati a partire da `connectionVerifiedAt`:
 * così, disconnettendo e ricollegando (anche a un progetto diverso/vuoto), i job
 * della connessione precedente non contano più e il pulsante torna abilitato.
 * Senza connessione verificata → 'idle'.
 *
 * `jobs` è atteso ordinato per startedAt desc (il primo match è il più recente).
 */
export function resolveSyncState(
  jobs: JobLike[],
  connectionVerifiedAt: Date | string | null | undefined,
): SyncState {
  if (!connectionVerifiedAt) return 'idle';
  const connectedAt = new Date(connectionVerifiedAt).getTime();

  const latestBulk = jobs.find(
    (j) => j.jobType === 'initial_bulk' && new Date(j.startedAt).getTime() >= connectedAt,
  );

  if (latestBulk?.status === 'running') return 'in_progress';
  if (latestBulk?.status === 'completed') return 'completed';
  return 'idle';
}
