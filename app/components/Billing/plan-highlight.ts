import type { PlanCard } from './plan-catalog';

// Il piano "Consigliato" va risaltato solo se e' davvero un upgrade: se il negozio
// e' gia' su un piano superiore, suggerirgli un downgrade non ha senso e la card
// resta neutra come le altre.
//
// Il confronto e' sul prezzo, non su una classifica scritta a mano: il listino
// vive nella tabella `plans` e puo' cambiare — anche nei nomi — senza che questo
// debba saperlo.
export function shouldHighlightRecommended(
  cards: PlanCard[],
  currentPlan: string | null | undefined,
): boolean {
  const recommended = cards.find((plan) => plan.recommended);
  if (!recommended) return false;

  const id = (currentPlan ?? '').trim().toLowerCase();
  // Nessun piano registrato: negozio appena installato, il consiglio ha senso.
  if (!id) return true;

  const current = cards.find((plan) => plan.name.trim().toLowerCase() === id);
  // Piano fuori listino (es. lifetime): superiore per definizione, niente da
  // consigliare.
  if (!current) return false;

  return current.priceMonthly < recommended.priceMonthly;
}
