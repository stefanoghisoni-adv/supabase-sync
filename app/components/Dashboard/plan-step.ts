import type { PlanCard } from '~/components/Billing/plan-catalog';
import { formatPrice } from '~/components/Billing/plan-catalog';
import { effectivePrice } from '~/lib/billing/partner-pricing';
import { samePlanName } from '~/lib/billing/plan-name';

/**
 * Il terzo passo della dashboard: quale piano, prima di sincronizzare.
 *
 * Qui c'e' solo il testo — quale opzione si legge come, e quale parte
 * selezionata. Il confronto completo fra i piani resta nella tab Piano: questo
 * passo deve far scegliere in dieci secondi, non spiegare il listino.
 */

export interface PlanChoiceOption {
  /** Nome del piano com'e' scritto nel listino: e' anche il valore inviato. */
  value: string;
  /** "Pro — € 29/mese", "Free — Gratis". */
  label: string;
  /** Le tre cose che distinguono davvero un piano dall'altro. */
  helpText: string;
}

/** Le sole voci che cambiano fra un piano e l'altro: il resto e' uguale ovunque. */
const DISTINGUISHING_FEATURES = new Set(['products', 'sync', 'customers']);

/**
 * Cosa include un piano, in una riga.
 *
 * Le voci non incluse restano fuori: in un elenco di una riga una X non si vede,
 * e "Sync clienti" scritto accanto a un piano che non li sincronizza si legge
 * come una promessa.
 */
export function planSummary(card: Pick<PlanCard, 'features'> | null | undefined): string {
  if (!card) return '';
  return card.features
    .filter((feature) => DISTINGUISHING_FEATURES.has(feature.key) && feature.included)
    .map((feature) => feature.label)
    .join(' · ');
}

/** "€ 29/mese", oppure "Gratis" quando non c'e' niente da pagare. */
export function planPriceLabel(card: PlanCard, discountIntervals: number | null): string {
  const price = effectivePrice(card.priceMonthly, card.partnerMonthly, discountIntervals);
  if (!(price.payablePrice > 0)) return 'Gratis';
  return `€ ${formatPrice(price.payablePrice)}/mese`;
}

export function planChoiceOptions(
  cards: PlanCard[],
  discountIntervals: number | null,
): PlanChoiceOption[] {
  return cards.map((card) => ({
    value: card.name,
    label: `${card.name} — ${planPriceLabel(card, discountIntervals)}`,
    helpText: planSummary(card),
  }));
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
