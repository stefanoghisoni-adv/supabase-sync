// Il nome tecnico del piano (colonna plan_name) non e' adatto alla UI: mappa esplicita.
const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro+',
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
