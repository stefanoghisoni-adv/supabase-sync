// Chi puo' vedere la tab "Piano". I piani interni assegnati dall'owner (lifetime)
// non hanno limiti ne' scadenza: non c'e' nulla da acquistare o da aggiornare,
// quindi la voce di menu sparisce e la rotta risponde 403 (non basta nascondere
// il link: /plan resta digitabile a mano).
const PLANS_WITHOUT_BILLING = new Set(['lifetime']);

export function canAccessPlanTab(currentPlan: string | null | undefined): boolean {
  const id = (currentPlan ?? '').trim().toLowerCase();
  // Piano sconosciuto o non ancora assegnato: la tab resta visibile, e' il caso
  // normale di uno shop appena installato (free).
  return !PLANS_WITHOUT_BILLING.has(id);
}
