import type { PlanCard } from '~/components/Billing/plan-catalog';
import { formatPrice } from '~/components/Billing/plan-catalog';
import { isSelectablePlan } from '~/components/Billing/plan-access';
import { effectivePrice } from '~/lib/billing/partner-pricing';
import { samePlanName } from '~/lib/billing/plan-name';

/**
 * Il terzo passo della dashboard: quale piano, prima di sincronizzare.
 *
 * Qui c'e' solo il testo — quale opzione si legge come, e quale parte
 * selezionata. Il confronto completo fra i piani resta nella tab Piano: questo
 * passo deve far scegliere in dieci secondi, non spiegare il listino.
 */

/** "€ 29/mese", oppure "Gratis" quando non c'e' niente da pagare. */
export function planPriceLabel(card: PlanCard, discountIntervals: number | null): string {
  const price = effectivePrice(card.priceMonthly, card.partnerMonthly, discountIntervals);
  if (!(price.payablePrice > 0)) return 'Gratis';
  return `€ ${formatPrice(price.payablePrice)}/mese`;
}

/**
 * Quale opzione risulta scelta all'apertura.
 *
 * Sempre il piano che il negozio ha adesso, anche quando e' il gratuito e non
 * l'ha scelto nessuno: e' quello su cui l'app sta lavorando, e proporne un
 * altro gia' spuntato significherebbe far confermare una spesa a chi voleva
 * solo andare avanti. Se il piano corrente non e' fra le opzioni (piani interni
 * assegnati dall'owner) non si preseleziona niente.
 */
export function preselectedPlan(
  cards: PlanCard[],
  currentPlan: string | null | undefined,
): string {
  const current = cards.find((card) => samePlanName(card.name, currentPlan));
  return current?.name ?? '';
}

/**
 * Il piano consigliato a questo negozio: il piu' economico che contenga tutto
 * il catalogo.
 *
 * Non e' il "consigliato" del listino, che e' lo stesso per tutti: qui la
 * raccomandazione nasce dai prodotti che il negozio ha davvero. Il conto si fa
 * sui prodotti TOTALI e non sui soli idonei — un prodotto oggi senza costo
 * diventa idoneo appena il merchant lo compila, e a quel punto un piano scelto
 * sugli idonei di oggi lo taglierebbe fuori.
 *
 * Se nessuno li contiene tutti si consiglia il piu' capiente: e' il meglio che
 * il listino possa fare, e tacere lascerebbe senza indicazione proprio il
 * negozio piu' grande.
 */
export function recommendedPlan(
  cards: PlanCard[],
  totalProducts: number | null,
  maxProductsByName: Record<string, number | null>,
): string | null {
  const selectable = cards.filter((card) => isSelectablePlan(card.name));
  if (selectable.length === 0 || totalProducts == null) return null;

  const byPrice = [...selectable].sort(
    (a, b) => a.priceMonthly - b.priceMonthly || a.name.localeCompare(b.name),
  );

  const fits = byPrice.find((card) => {
    const max = maxProductsByName[card.name];
    return max == null || max >= totalProducts;
  });

  return (fits ?? byPrice[byPrice.length - 1]).name;
}
