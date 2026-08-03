// Logica del pulsante CTA nelle card dei piani: label, stato (loading/disabled) e
// testo dei banner di esito dopo il ritorno dal flusso di addebito.

export function planButtonLabel(planName: string, isCurrent: boolean): string {
  return isCurrent ? 'Piano attuale' : `Scegli ${planName}`;
}

export interface PlanButtonState {
  loading: boolean;
  disabled: boolean;
}

// Il pulsante del piano che si sta acquistando va in loading; tutti gli altri vanno
// disabilitati (anche quello del piano attuale, già disabilitato di suo) per evitare
// doppie sottomissioni.
export function planButtonState(
  planName: string,
  isCurrent: boolean,
  submittingPlan: string | null,
): PlanButtonState {
  const isSubmitting = submittingPlan === planName;
  // Disabilitato se: è il piano attuale, oppure c'è una sottomissione in corso
  // (che sia per questo piano o un altro).
  const disabled = isCurrent || submittingPlan !== null;
  return { loading: isSubmitting, disabled };
}

export type BillingOutcome = 'success' | 'error' | null;

// Legge il parametro querystring ?billing=ok|ko e lo traduce in esito. Qualsiasi
// valore diverso da 'ok' viene trattato come errore (billing=ko, billing=cancelled,
// o valori non previsti).
export function billingOutcome(param: string | null): BillingOutcome {
  if (param === null) return null;
  return param === 'ok' ? 'success' : 'error';
}

// Testi dei banner mostrati dopo il ritorno dal flusso di addebito.
export const BILLING_SUCCESS_BANNER = {
  title: 'Piano aggiornato',
  message:
    'Il tuo piano è attivo: limiti e frequenza di sincronizzazione sono già stati applicati.',
};

export const BILLING_ERROR_BANNER = {
  title: 'Cambio piano non completato',
  message:
    'Il cambio di piano non è stato completato. Niente è cambiato e non ci sono addebiti.',
};
