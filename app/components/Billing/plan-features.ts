// Le feature incluse (verdi) vanno mostrate prima delle non incluse (grigie).
// Array.prototype.sort e' stabile (Node >= 11), quindi l'ordine di catalogo si
// conserva dentro ciascun gruppo. Copiamo l'array per non mutare l'input.
// Oggi e' un no-op sul catalogo (l'ordine canonico e' gia' verdi-prima): resta
// come rete di sicurezza se un piano futuro elencasse le righe in altro ordine.
export function sortFeatures<T extends { included: boolean }>(features: T[]): T[] {
  return [...features].sort((a, b) => Number(b.included) - Number(a.included));
}
