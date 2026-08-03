import { describe, it, expect } from 'vitest';
import {
  planButtonLabel,
  planButtonState,
  billingOutcome,
  BILLING_SUCCESS_BANNER,
  BILLING_ERROR_BANNER,
} from './plan-cta';

describe('planButtonLabel', () => {
  it('restituisce "Piano attuale" se isCurrent è true', () => {
    expect(planButtonLabel('Starter', true)).toBe('Piano attuale');
    expect(planButtonLabel('Professional', true)).toBe('Piano attuale');
  });

  it('restituisce "Scegli <nome>" se isCurrent è false', () => {
    expect(planButtonLabel('Starter', false)).toBe('Scegli Starter');
    expect(planButtonLabel('Professional', false)).toBe('Scegli Professional');
  });
});

describe('planButtonState', () => {
  it('disabilita solo il piano attuale quando non c\'è sottomissione', () => {
    const current = planButtonState('Starter', true, null);
    expect(current.disabled).toBe(true);
    expect(current.loading).toBe(false);

    const other = planButtonState('Professional', false, null);
    expect(other.disabled).toBe(false);
    expect(other.loading).toBe(false);
  });

  it('mette in loading solo il piano in sottomissione', () => {
    const submitting = planButtonState('Professional', false, 'Professional');
    expect(submitting.loading).toBe(true);
    expect(submitting.disabled).toBe(true);
  });

  it('disabilita tutti i piani quando c\'è una sottomissione in corso', () => {
    // Piano attuale
    const current = planButtonState('Starter', true, 'Professional');
    expect(current.disabled).toBe(true);
    expect(current.loading).toBe(false);

    // Piano diverso da quello in sottomissione
    const other = planButtonState('Business', false, 'Professional');
    expect(other.disabled).toBe(true);
    expect(other.loading).toBe(false);

    // Piano in sottomissione
    const submitting = planButtonState('Professional', false, 'Professional');
    expect(submitting.disabled).toBe(true);
    expect(submitting.loading).toBe(true);
  });
});

describe('billingOutcome', () => {
  it('restituisce null se il parametro è null', () => {
    expect(billingOutcome(null)).toBe(null);
  });

  it('restituisce "success" se il parametro è "ok"', () => {
    expect(billingOutcome('ok')).toBe('success');
  });

  it('restituisce "error" per qualsiasi valore diverso da "ok"', () => {
    expect(billingOutcome('ko')).toBe('error');
    expect(billingOutcome('cancelled')).toBe('error');
    expect(billingOutcome('failed')).toBe('error');
    expect(billingOutcome('')).toBe('error');
    expect(billingOutcome('anything')).toBe('error');
  });
});

describe('BILLING_SUCCESS_BANNER', () => {
  it('contiene titolo e messaggio in italiano', () => {
    expect(BILLING_SUCCESS_BANNER.title).toBe('Piano aggiornato');
    expect(BILLING_SUCCESS_BANNER.message).toContain('Il tuo piano è attivo');
  });
});

describe('BILLING_ERROR_BANNER', () => {
  it('contiene titolo e messaggio in italiano', () => {
    expect(BILLING_ERROR_BANNER.title).toBe('Cambio piano non completato');
    expect(BILLING_ERROR_BANNER.message).toContain('non è stato completato');
  });
});
