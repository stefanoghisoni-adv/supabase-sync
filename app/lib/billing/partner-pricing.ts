/**
 * Prezzo riservato ai negozi in rapporto con un partner.
 *
 * Il listino riservato registra il prezzo FINALE (19 → 14), perche' e' cosi'
 * che lo si decide e perche' una percentuale produrrebbe cifre con i decimali
 * invece di prezzi tondi. Shopify pero' vuole il prezzo di listino piu' uno
 * sconto: si sottoscrive a 19 con 5 di sconto per N cicli, e allo scadere il
 * prezzo pieno riparte da solo.
 *
 * Non e' un dettaglio implementativo indifferente: sottoscrivendo direttamente
 * a 14 il merchant resterebbe a 14 per sempre, e la durata concordata non
 * varrebbe niente.
 */

export interface PartnerPrice {
  planName: string;
  priceMonthly: number;
  priceYearly: number;
}

export type BillingInterval = 'monthly' | 'yearly';

export interface EffectivePrice {
  /** Prezzo di listino, quello che Shopify registra come ricorrente. */
  listPrice: number;
  /** Prezzo che il merchant paga finche' lo sconto e' in corso. */
  payablePrice: number;
  /** Differenza da comunicare a Shopify come sconto. 0 = nessuno sconto. */
  discountAmount: number;
  /** Per quanti cicli vale. null = per sempre. */
  discountIntervals: number | null;
}

/**
 * Prezzo effettivo di un piano per un negozio.
 *
 * Senza listino riservato, o con un prezzo riservato che non e' un risparmio,
 * si torna al listino pubblico: un "sconto" che alza il prezzo sarebbe un
 * errore di configurazione, e applicarlo alla lettera lo farebbe pagare al
 * merchant.
 */
export function effectivePrice(
  listPrice: number,
  partnerPrice: number | null | undefined,
  discountIntervals: number | null | undefined,
): EffectivePrice {
  const noDiscount: EffectivePrice = {
    listPrice,
    payablePrice: listPrice,
    discountAmount: 0,
    discountIntervals: null,
  };

  if (partnerPrice == null) return noDiscount;
  if (!Number.isFinite(partnerPrice) || partnerPrice < 0) return noDiscount;
  if (partnerPrice >= listPrice) return noDiscount;

  // Zero cicli non significa "per sempre": significa uno sconto che non vale
  // mai, ed e' quasi certamente un campo lasciato a zero per sbaglio. Meglio
  // ignorarlo che addebitare uno sconto di durata nulla.
  const intervals =
    discountIntervals == null || discountIntervals <= 0 ? null : Math.floor(discountIntervals);

  return {
    listPrice,
    payablePrice: partnerPrice,
    // Arrotondato ai centesimi: la sottrazione fra due prezzi in virgola mobile
    // produce code (19 - 14.9 = 4.100000000000001) che Shopify rifiuterebbe o,
    // peggio, accetterebbe addebitando un centesimo di troppo.
    discountAmount: Math.round((listPrice - partnerPrice) * 100) / 100,
    discountIntervals: intervals,
  };
}

/** Sceglie il prezzo del ciclo di fatturazione richiesto. */
export function priceForInterval(
  price: { priceMonthly: number; priceYearly: number },
  interval: BillingInterval,
): number {
  return interval === 'yearly' ? price.priceYearly : price.priceMonthly;
}

/**
 * Etichetta del risparmio, da mostrare accanto al piano.
 *
 * In valuta e non in percentuale: i prezzi riservati sono decisi come cifre
 * tonde, e una percentuale ricavata all'indietro darebbe numeri come "26,3%"
 * che non corrispondono a niente di concordato.
 */
export function savingBadge(price: EffectivePrice, currency = '€'): string | null {
  if (price.discountAmount <= 0) return null;
  return `− ${currency} ${formatAmount(price.discountAmount)}`;
}

/**
 * Importo con i centesimi sempre scritti.
 *
 * Anche quando la cifra e' tonda: e' un valore di denaro, e "€ 5" accanto a
 * "€ 4,10" fa sembrare il primo un'approssimazione invece di un importo esatto.
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
