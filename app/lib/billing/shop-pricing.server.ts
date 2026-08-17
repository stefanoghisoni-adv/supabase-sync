import { prisma } from '~/db.server';
import {
  completeCurrencies,
  planPricesIn,
  resolveShopCurrency,
  type PricedPlan,
} from './currency';

/**
 * Il listino come lo vede UN negozio: i prezzi e la valuta in cui sono scritti.
 *
 * I due viaggiano sempre insieme. Separarli e' esattamente il guaio da evitare:
 * un numero senza la sua valuta viene mostrato con quella sbagliata, e finisce
 * che l'app promette un prezzo che Shopify non addebita.
 */
export interface ShopPricing<T extends PricedPlan> {
  currency: string;
  plans: T[];
}

/**
 * Legge il listino in valuta e decide in quale parlare a questo negozio.
 *
 * `plan_prices` e' una tabella di poche righe e la si legge per intero: filtrare
 * per valuta risparmierebbe niente e impedirebbe di sapere quali valute sono
 * complete, che e' la domanda vera.
 */
export async function resolveShopPricing<T extends PricedPlan>(
  plans: T[],
  opts: { billingCurrency: string | null | undefined; hasReservedPrice: boolean },
): Promise<ShopPricing<T>> {
  const rows = await prisma.planPrice.findMany();
  const prices = rows.map((row) => ({
    planName: row.planName,
    currency: row.currency,
    priceMonthly: Number(row.priceMonthly),
    priceYearly: Number(row.priceYearly),
  }));

  const currency = resolveShopCurrency({
    shopCurrency: opts.billingCurrency,
    complete: completeCurrencies(plans, prices),
    hasReservedPrice: opts.hasReservedPrice,
  });

  return { currency, plans: planPricesIn(plans, prices, currency) };
}
