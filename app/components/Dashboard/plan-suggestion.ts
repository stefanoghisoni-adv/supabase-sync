import { isSelectablePlan } from '~/components/Billing/plan-access';
import { formatMoney } from '~/lib/billing/money';
import type { Locale } from '~/lib/i18n/locales';
import type { Dictionary } from '~/lib/i18n/context';

type Strings = Pick<Dictionary, 'planCompare'>;

/**
 * Quale piano proporre a chi ha piu' prodotti di quanti il suo ne sincronizzi.
 *
 * Il conto si fa sui prodotti TOTALI del negozio, non su quelli idonei: un
 * prodotto oggi senza costo diventa idoneo appena il merchant lo compila, e a
 * quel punto il tetto lo taglierebbe fuori comunque. Proporre un piano
 * dimensionato sui soli idonei di oggi vorrebbe dire farlo tornare qui domani.
 */

export interface PlanForSuggestion {
  planName: string;
  priceMonthly: number;
  priceYearly: number;
  /** null = nessun tetto. */
  maxProducts: number | null;
  maxCustomers: number | null;
  customersSyncEnabled: boolean;
}

export function suggestPlanForProducts(
  plans: PlanForSuggestion[],
  currentPlanName: string | null | undefined,
  totalProducts: number,
): PlanForSuggestion | null {
  const current = (currentPlanName ?? '').trim().toLowerCase();
  const currentPlan = plans.find((p) => p.planName.trim().toLowerCase() === current) ?? null;

  // Piano senza tetto: non c'e' niente che resti fuori, quindi niente da
  // proporre. Vale anche per i piani interni, che di tetti non ne hanno.
  if (!currentPlan || currentPlan.maxProducts == null) return null;

  // Sotto il tetto ci si sta: nessun avviso. Il caso "quasi al limite" e' un
  // avviso diverso, che esiste gia' e parla di quota in esaurimento.
  if (totalProducts <= currentPlan.maxProducts) return null;

  const candidates = plans.filter((plan) => {
    // I piani interni (lifetime) non si comprano: proporli manderebbe il
    // merchant su una pagina che per lui non esiste. Senza questo filtro
    // sarebbero anche i primi a essere scelti, perche' costano zero e non
    // hanno tetti.
    if (!isSelectablePlan(plan.planName)) return false;
    if (plan.planName.trim().toLowerCase() === current) return false;
    // Deve contenerli tutti: un piano che ne lascia comunque fuori una parte
    // non risolve il problema per cui lo stiamo proponendo.
    if (plan.maxProducts != null && plan.maxProducts < totalProducts) return false;
    // E deve essere un passo avanti: un piano piu' economico con un tetto piu'
    // alto sarebbe un errore di listino, non un'occasione da suggerire.
    return plan.priceMonthly > currentPlan.priceMonthly;
  });

  if (candidates.length === 0) return null;

  // Il piu' economico fra quelli che bastano. A parita' di prezzo l'ordine
  // alfabetico rende la scelta prevedibile invece che casuale.
  return [...candidates].sort(
    (a, b) => a.priceMonthly - b.priceMonthly || a.planName.localeCompare(b.planName),
  )[0];
}

/** Come si scrive un tetto nel confronto fra piani. */
export function limitLabel(limit: number | null, t: Strings): string {
  return limit == null ? t.planCompare.unlimited : String(limit);
}

export interface PlanComparisonRow {
  label: string;
  current: string;
  next: string;
}

/**
 * Le righe del confronto fra il piano in uso e quello proposto.
 *
 * Solo le voci che cambiano davvero fra i due: una tabella in cui meta' delle
 * righe ripete lo stesso valore fa sembrare l'aggiornamento meno utile di
 * quanto sia, e costringe a cercare col dito la differenza.
 */
export function planComparisonRows(
  currentPlan: PlanForSuggestion,
  nextPlan: PlanForSuggestion,
  /** Valuta dei prezzi qui sopra: arriva con loro, non si indovina. */
  currency: string,
  locale: Locale,
  t: Strings,
): PlanComparisonRow[] {
  const rows: PlanComparisonRow[] = [
    {
      label: t.planCompare.products,
      current: limitLabel(currentPlan.maxProducts, t),
      next: limitLabel(nextPlan.maxProducts, t),
    },
    {
      label: t.planCompare.customers,
      current: currentPlan.customersSyncEnabled
        ? limitLabel(currentPlan.maxCustomers, t)
        : t.planCompare.notIncluded,
      next: nextPlan.customersSyncEnabled
        ? limitLabel(nextPlan.maxCustomers, t)
        : t.planCompare.notIncluded,
    },
    {
      label: t.planCompare.monthlyCost,
      current: priceLabel(currentPlan.priceMonthly, currency, locale, t),
      next: priceLabel(nextPlan.priceMonthly, currency, locale, t),
    },
  ];

  return rows.filter((row) => row.current !== row.next);
}

function priceLabel(price: number, currency: string, locale: Locale, t: Strings): string {
  return price === 0
    ? t.planCompare.free
    : t.planCompare.perMonth(formatMoney(price, currency, locale));
}
