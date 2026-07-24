// Massimo dell'asse Y del grafico idoneita'. Serve a lasciare respiro SOPRA la
// linea tratteggiata del limite del piano: con l'auto-scale di polaris-viz la
// linea finirebbe esattamente sul bordo superiore e, quando i sincronizzabili
// sono pochissimi (es. 3 su un limite di 100), risulterebbe schiacciata in cima
// e poco leggibile. Alzando il tetto un po' oltre il limite, la linea resta
// visibile a mezza altezza a prescindere da quanti prodotti siano gia' idonei.
export function computeChartYMax(
  planLimit: number | null,
  maxData: number,
): number | undefined {
  // Il tetto deve stare sopra il valore piu' alto tra il limite del piano e i
  // dati (i dati potrebbero, in teoria, superare il limite).
  const base = Math.max(planLimit ?? 0, maxData);
  if (base <= 0) return undefined; // nessun dato: lascia decidere a polaris-viz

  // ~20% di margine, arrotondato a un passo "pulito" cosi' l'asse mostra numeri
  // tondi (0, 25, 50, 75, 100, 125...) e il limite cade su una tacca.
  const step = base <= 50 ? 10 : base <= 200 ? 25 : 50;
  return Math.ceil((base * 1.2) / step) * step;
}
