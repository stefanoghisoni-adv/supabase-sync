// Stato di autorizzazione all'uso dell'app per un negozio. Gestito manualmente
// dall'owner sulla tabella `shops` di Supabase, e/o impostato automaticamente
// (es. trial scaduto → PENDING). Il gating è SERVER-SIDE: anche se l'utente
// riabilita i pulsanti nell'HTML, le azioni vengono comunque rifiutate.
export type AuthorizationState = 'ENABLED' | 'PENDING' | 'DISABLED';

export function normalizeAuthorization(value: string | null | undefined): AuthorizationState {
  const v = (value ?? 'ENABLED').toString().trim().toUpperCase();
  if (v === 'DISABLED') return 'DISABLED';
  if (v === 'PENDING') return 'PENDING';
  return 'ENABLED';
}

// True solo se il negozio può usare l'app normalmente.
export function isAuthorized(value: string | null | undefined): boolean {
  return normalizeAuthorization(value) === 'ENABLED';
}

// Gate FAIL-CLOSED per l'accesso ai dati (proxy di lettura).
//
// `normalizeAuthorization` è deliberatamente permissiva: mappa a ENABLED tutto
// ciò che non riconosce, così la UI non si blocca su valori nulli o legacy.
// Sul percorso dati quel comportamento è però un bypass: la colonna
// `authorization` è testo libero senza CHECK constraint, editata a mano
// dall'owner su Supabase, e un refuso ("DISABLD", "BANNED") concederebbe
// silenziosamente l'accesso proprio allo shop che si voleva bloccare.
// Qui l'unico valore che concede accesso è l'esatto ENABLED: qualsiasi altra
// cosa — inclusa una stringa sconosciuta — nega.
export function grantsDataAccess(value: string | null | undefined): boolean {
  return (value ?? '').trim().toUpperCase() === 'ENABLED';
}

// Messaggio utente per lo stato di blocco (banner e risposte d'errore).
export function authorizationMessage(state: AuthorizationState): string {
  if (state === 'DISABLED') {
    return "L'utilizzo dell'app è stato disabilitato per questo negozio. Contatta il supporto.";
  }
  if (state === 'PENDING') {
    return 'Il periodo di prova è terminato: il tracciamento che utilizza le tabelle Supabase è sospeso. Aggiorna il piano per riattivarlo.';
  }
  return '';
}
