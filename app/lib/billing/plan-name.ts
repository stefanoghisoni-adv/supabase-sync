// Modulo puro: nessun import da un `.server`, cosi' vale identico nei loader,
// nei componenti e nei worker.

// Il nome del piano sta scritto in tre posti che non cambiano insieme: il
// listino (`plans.plan_name`), il piano del negozio (`shops.current_plan`) e il
// piano dell'ultima sincronizzazione (`shops.last_synced_plan`). Basta
// rinominare un piano nel listino perche' i tre smettano di combaciare alla
// lettera, e un confronto esatto direbbe "piano cambiato" a ogni caricamento o
// non troverebbe piu' il piano fra quelli in memoria.
//
// Per la ricerca sul database c'e' `findPlanByName` in find-plan.server.ts:
// questa e' la stessa regola applicata ai confronti in memoria.

/** Il nome del piano ridotto alla forma con cui si confronta. */
export function normalizePlanName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/** Due nomi indicano lo stesso piano, a meno di maiuscole e spazi ai bordi. */
export function samePlanName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizePlanName(a);
  // Due nomi vuoti non sono "lo stesso piano": sono due assenze.
  if (!left) return false;
  return left === normalizePlanName(b);
}
