// La sincronizzazione e' automatica e sempre attiva: non e' una preferenza del
// merchant, e' quello che l'app fa. L'unica condizione e' che ci sia un progetto
// collegato e verificato — senza, non c'e' dove scrivere.
//
// Quali tabelle vengano tenute allineate lo decide il piano (i clienti solo dove
// sono inclusi), non un interruttore: quel controllo sta altrove e resta.
//
// Lo scollegamento cancella la configurazione, quindi un negozio scollegato non
// ha nulla da verificare qui e la sync si ferma da sola.

export interface SyncableConfig {
  connectionVerifiedAt: Date | null;
}

export function syncIsActive(
  config: SyncableConfig | null | undefined,
): boolean {
  return !!config?.connectionVerifiedAt;
}

/**
 * Lo stesso controllo come filtro Prisma, per le query che cercano i negozi da
 * sincronizzare. Sta qui accanto a `syncIsActive` di proposito: se la condizione
 * cambia, deve cambiare in un posto solo.
 */
export const SYNC_ACTIVE_CONFIG_FILTER = {
  connectionVerifiedAt: { not: null },
} as const;
