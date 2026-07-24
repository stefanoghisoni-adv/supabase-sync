import type { PlanFeature } from './plan-catalog';

// Le feature incluse (verdi) vanno mostrate prima delle non incluse (grigie).
// Array.prototype.sort e' stabile (Node >= 11), quindi l'ordine di catalogo si
// conserva dentro ciascun gruppo. Copiamo l'array per non mutare l'input.
export function sortFeatures(features: PlanFeature[]): PlanFeature[] {
  return [...features].sort((a, b) => Number(b.included) - Number(a.included));
}
