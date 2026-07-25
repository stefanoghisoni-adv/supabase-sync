// Massimo dell'asse Y del grafico idoneita'. Serve a lasciare respiro SOPRA la
// linea tratteggiata del limite del piano: con l'auto-scale di polaris-viz la
// linea finirebbe esattamente sul bordo superiore e, quando i sincronizzabili
// sono pochissimi (es. 3 su un limite di 100), risulterebbe schiacciata in cima
// e poco leggibile. Alzando il tetto oltre il limite, la linea resta visibile a
// mezza altezza a prescindere da quanti prodotti siano gia' idonei.
export function computeChartYMax(
  planLimit: number | null,
  maxData: number,
): number | undefined {
  // Con un limite di piano puntiamo a 1.5x: sopra la tratteggiata resta spazio
  // per un'altra tacca intera (limite 50 -> asse fino a 75). Sui piani illimitati
  // (planLimit null) non c'e' linea da distanziare, quindi bastano i dati + 20%.
  // Il max copre il caso in cui i dati superino il limite.
  const target = Math.max((planLimit ?? 0) * 1.5, maxData * 1.2);
  if (target <= 0) return undefined; // nessun dato: lascia decidere a polaris-viz

  // Arrotondamento a un passo "pulito" cosi' l'asse mostra numeri tondi
  // (0, 25, 50, 75...) e il limite del piano cade su una tacca.
  const step = target <= 50 ? 10 : target <= 200 ? 25 : target <= 1000 ? 50 : 250;
  return Math.ceil(target / step) * step;
}
