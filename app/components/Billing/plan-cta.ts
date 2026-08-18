import type { Dictionary } from '~/lib/i18n/context';

// Logica del pulsante CTA nelle card dei piani: label, stato (loading/disabled) e
// testo dei banner di esito dopo il ritorno dal flusso di addebito.

type Strings = Pick<Dictionary, 'plan'>;

export function planButtonLabel(
  planName: string,
  isCurrent: boolean,
  t: Strings,
): string {
  return isCurrent ? t.plan.currentPlan : t.plan.choose(planName);
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

// Testi dei banner mostrati dopo il ritorno dal flusso di addebito. Vivono nel
// dizionario come tutto il resto: qui resta la sola scelta di quale dei due.
export function billingBanner(outcome: Exclude<BillingOutcome, null>, t: Strings) {
  return outcome === 'success' ? t.plan.successBanner : t.plan.errorBanner;
}
