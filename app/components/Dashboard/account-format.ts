import { canAccessPlanTab } from '~/components/Billing/plan-access';

// Il nome tecnico del piano (colonna plan_name) non e' adatto alla UI: mappa esplicita.
const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
  lifetime: 'Lifetime',
};

export function planLabel(planName: string | null | undefined): string {
  const key = (planName ?? '').trim().toLowerCase();
  if (!key) return '—';
  if (PLAN_LABELS[key]) return PLAN_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export interface SyncBadge {
  tone?: 'success';
  content: string;
}

// Badge di una sincronizzazione: verde quando gira, grigio quando non gira. Il
// grigio e' lo stesso dei badge senza tono (es. il piano Lifetime): "non attiva"
// non e' un errore, e' solo una funzione che al momento non e' in uso.
export function syncStatusBadge(active: boolean): SyncBadge {
  return active ? { tone: 'success', content: 'Attiva' } : { content: 'Non attiva' };
}

export interface PlanOption {
  planName: string;
  priceMonthly: number;
  customersSyncEnabled: boolean;
}

/**
 * Piano piu' economico fra quelli che includono la sincronizzazione dei clienti,
 * per invitare all'upgrade chi non ce l'ha. Restituisce il nome tecnico (da
 * passare a planLabel) oppure null se non c'e' nulla da proporre.
 *
 * Fuori restano i piani non acquistabili (lifetime, assegnato dall'owner): non
 * hanno una pagina di acquisto e proporli manderebbe il merchant su una tab che
 * per lui non esiste.
 */
export function firstPlanWithCustomersSync(
  plans: PlanOption[],
  currentPlan: string | null | undefined,
): string | null {
  const current = (currentPlan ?? '').trim().toLowerCase();
  const candidates = plans
    .filter(
      (p) =>
        p.customersSyncEnabled &&
        canAccessPlanTab(p.planName) &&
        p.planName.trim().toLowerCase() !== current,
    )
    // A parita' di prezzo l'ordine alfabetico rende il risultato prevedibile.
    .sort((a, b) => a.priceMonthly - b.priceMonthly || a.planName.localeCompare(b.planName));

  return candidates[0]?.planName ?? null;
}

// Plan.maxSyncFrequencyHours e' un Float: sotto l'ora si legge meglio in minuti,
// sopra le 24 ore (multipli esatti) in giorni ("Ogni 7 giorni" invece di "168 ore").
export function syncFrequencyLabel(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 1) return `Ogni ${Math.round(hours * 60)} minuti`;
  if (hours === 1) return 'Ogni ora';
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'Ogni giorno' : `Ogni ${days} giorni`;
  }
  const value = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `Ogni ${value} ore`;
}
