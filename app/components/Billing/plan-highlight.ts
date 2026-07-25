import type { PlanId } from './plan-catalog';
import { PLAN_CATALOG } from './plan-catalog';

const RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

// Il piano "Consigliato" va risaltato solo se e' davvero un upgrade: se il negozio
// e' gia' su un piano superiore, suggerirgli un downgrade non ha senso e la card
// resta neutra come le altre. Un piano fuori catalogo (es. 'lifetime') e' trattato
// come superiore; nessun piano registrato = negozio appena installato, quindi Free.
export function shouldHighlightRecommended(currentPlan: string | null | undefined): boolean {
  const recommended = PLAN_CATALOG.find((plan) => plan.recommended);
  if (!recommended) return false;

  const id = (currentPlan ?? '').trim().toLowerCase();
  if (!id) return true;

  const rank = id in RANK ? RANK[id as PlanId] : Number.POSITIVE_INFINITY;
  return rank < RANK[recommended.id];
}
