import { describe, it, expect } from 'vitest';
import {
  completeCurrencies,
  planPricesIn,
  resolveShopCurrency,
  type PlanPriceRow,
  type PricedPlan,
} from './currency';
import { BASE_CURRENCY, formatMoney, formatMoneyExact } from './money';

const PLANS: PricedPlan[] = [
  { planName: 'free', priceMonthly: 0, priceYearly: 0 },
  { planName: 'starter', priceMonthly: 19, priceYearly: 190 },
  { planName: 'pro', priceMonthly: 29, priceYearly: 290 },
];

function usd(planName: string, priceMonthly: number, priceYearly: number): PlanPriceRow {
  return { planName, currency: 'USD', priceMonthly, priceYearly };
}

describe('completeCurrencies', () => {
  it('elenca solo le valute che coprono ogni piano a pagamento', () => {
    const prices = [usd('starter', 21, 210), usd('pro', 32, 320)];
    expect(completeCurrencies(PLANS, prices)).toEqual(['USD']);
  });

  it("un listino a meta' non conta: due valute nella stessa schermata non si leggono", () => {
    expect(completeCurrencies(PLANS, [usd('pro', 32, 320)])).toEqual([]);
  });

  it('il piano gratuito non ha bisogno di una riga', () => {
    const prices = [usd('starter', 21, 210), usd('pro', 32, 320)];
    expect(completeCurrencies(PLANS, prices)).toContain('USD');
    expect(prices.some((row) => row.planName === 'free')).toBe(false);
  });
});

describe('resolveShopCurrency', () => {
  it('usa la valuta del negozio quando il listino esiste tutto', () => {
    expect(resolveShopCurrency({ shopCurrency: 'USD', complete: ['USD'] })).toBe('USD');
  });

  it('senza listino in quella valuta si resta alla base: meglio euro che un prezzo falso', () => {
    expect(resolveShopCurrency({ shopCurrency: 'USD', complete: [] })).toBe(BASE_CURRENCY);
    expect(resolveShopCurrency({ shopCurrency: 'GBP', complete: ['USD'] })).toBe(BASE_CURRENCY);
  });

  it("un prezzo riservato tiene il negozio nella valuta in cui e' stato concordato", () => {
    expect(
      resolveShopCurrency({ shopCurrency: 'USD', complete: ['USD'], hasReservedPrice: true }),
    ).toBe(BASE_CURRENCY);
  });

  it('valuta sconosciuta o assente: base', () => {
    expect(resolveShopCurrency({ shopCurrency: null, complete: ['USD'] })).toBe(BASE_CURRENCY);
    expect(resolveShopCurrency({ shopCurrency: '  ', complete: ['USD'] })).toBe(BASE_CURRENCY);
  });

  it('la sigla arriva come Shopify la scrive, non come capita', () => {
    expect(resolveShopCurrency({ shopCurrency: 'usd', complete: ['USD'] })).toBe('USD');
  });
});

describe('planPricesIn', () => {
  it('riscrive i prezzi nella valuta scelta', () => {
    const priced = planPricesIn(PLANS, [usd('starter', 21, 210), usd('pro', 32, 320)], 'USD');
    expect(priced.map((p) => p.priceMonthly)).toEqual([0, 21, 32]);
  });

  it('la valuta base non tocca niente', () => {
    expect(planPricesIn(PLANS, [usd('pro', 32, 320)], BASE_CURRENCY)).toEqual(PLANS);
  });
});

describe('formatMoney', () => {
  it('scrive la valuta accanto alla cifra, nella forma della lingua', () => {
    // Spazi unificatori: Intl usa NBSP fra cifra e simbolo.
    expect(formatMoney(29, 'EUR', 'it').replace(/ /g, ' ')).toBe('29 €');
    expect(formatMoney(29, 'USD', 'en')).toBe('$29');
  });

  it('i centesimi solo quando ci sono', () => {
    expect(formatMoney(9.9, 'EUR', 'it').replace(/ /g, ' ')).toBe('9,90 €');
  });

  it('gli importi esatti li scrivono sempre', () => {
    expect(formatMoneyExact(5, 'EUR', 'it').replace(/ /g, ' ')).toBe('5,00 €');
  });
});
