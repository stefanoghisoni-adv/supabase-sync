// Massimo dell'asse Y del grafico idoneita'. Serve a lasciare respiro SOPRA la
// linea tratteggiata del limite del piano: con l'auto-scale di polaris-viz la
// linea finirebbe esattamente sul bordo superiore e, quando i sincronizzabili
// sono pochissimi (es. 3 su un limite di 100), risulterebbe schiacciata in cima
// e poco leggibile. Alzando il tetto oltre il limite, la linea resta visibile a
// mezza altezza a prescindere da quanti prodotti siano gia' idonei.
//
// Usato solo sui piani SENZA tetto: quando un tetto c'e', l'asse lo decidono le
// tacche qui sotto.
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

// Quanto si sale oltre il tetto del piano: un quarto in piu', cosi' si vede
// quanto margine resta — e quanto si e' sforato, se si e' sforato.
const HEADROOM = 1.25;

// Numero di tacche a cui puntare: sotto si legge poco, sopra si affolla.
const TARGET_TICKS = 6;

// Passi "tondi" fra cui scegliere: quelli con cui si contano le cose a mente.
const NICE_STEPS = (() => {
  const steps: number[] = [];
  for (let k = 0; k <= 7; k++) {
    const unit = 10 ** k;
    for (const base of [1, 2, 5, 25]) steps.push(base * unit);
  }
  return [...new Set(steps)].sort((a, b) => a - b);
})();

function tickCount(limit: number, step: number, top: number): number {
  return Math.ceil(top / step) + 1; // +1 per lo zero
}

/**
 * Passo dell'asse: dev'essere un divisore esatto del tetto del piano, altrimenti
 * il tetto non cadrebbe su una tacca e non si potrebbe scrivere in arancione.
 * Fra i divisori "tondi" si sceglie quello che porta al numero di tacche piu'
 * vicino a TARGET_TICKS; a parita', quello che ne fa meno.
 */
function pickStep(limit: number, top: number): number {
  const divisors = NICE_STEPS.filter((s) => s <= limit && limit % s === 0);
  if (divisors.length === 0) return limit; // limite "scomodo": 0, limite, e via

  let best = divisors[divisors.length - 1];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const step of divisors) {
    const count = tickCount(limit, step, top);
    const score = Math.abs(count - TARGET_TICKS);
    // A parita' di distanza dal bersaglio vince il passo piu' grande, cioe'
    // l'asse con meno numeri sopra.
    if (score < bestScore || (score === bestScore && step > best)) {
      best = step;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Tacche dell'asse Y quando il piano ha un tetto.
 *
 * Il tetto dev'essere una tacca — e' quella che poi si scrive in arancione,
 * accanto alla linea tratteggiata — e l'asse deve proseguire oltre, cosi' si
 * vede quanto margine resta. Con un tetto di 100: 0, 25, 50, 75, 100, 125.
 *
 * `undefined` sui piani senza tetto: li' non c'e' nulla da far cadere su una
 * tacca e decide polaris-viz.
 */
export function computeChartYTicks(
  planLimit: number | null,
  maxData: number,
): number[] | undefined {
  if (planLimit == null || planLimit <= 0) return undefined;

  // Oltre il quarto in piu', l'asse deve comunque contenere i dati: con un
  // catalogo ben oltre il tetto, la linea dei sincronizzabili non deve uscire.
  const top = Math.max(planLimit * HEADROOM, maxData);
  const step = pickStep(planLimit, top);
  const last = Math.ceil(top / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= last; value += step) ticks.push(value);
  return ticks;
}
