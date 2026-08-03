// Unico modulo che importa polaris-viz. Sta a parte, ed e' caricato SOLO con un
// import dinamico dal browser (vedi EligibilityChart), per una ragione che
// abbiamo pagato in produzione: su Vercel il bundle server risolve il build CJS
// di @shopify/polaris-viz-core, che fa require('d3-scale') — modulo ESM-only.
// Il require esplode con ERR_REQUIRE_ESM al caricamento del modulo, cioe' prima
// ancora che una richiesta venga gestita, e ogni route SSR muore con
// FUNCTION_INVOCATION_FAILED. Tenendo l'import fuori dal grafo del server il
// require non avviene mai.
//
// Non importare questo file staticamente da nessuna parte.
import { LineChart, PolarisVizProvider } from '@shopify/polaris-viz';
import { FONT_FAMILY } from '@shopify/polaris-viz-core';
import type { DataSeries } from '@shopify/polaris-viz-core';

// Lo stesso arancione della linea tratteggiata: il numero sull'asse e la soglia
// che segna sono la stessa cosa e devono leggersi come tale.
const LIMIT_COLOR = '#FF8A00';

// Misure con cui polaris-viz impagina la colonna dei numeri a sinistra
// (Y_AXIS_CHART_SPACING e Y_AXIS_LABEL_OFFSET nelle sue costanti): servono a far
// cadere il nostro numero esattamente dove cadrebbe il suo.
const AXIS_GUTTER = 20;
const LABEL_OFFSET = 2;
const LABEL_RIGHT_EDGE = -(AXIS_GUTTER - LABEL_OFFSET);
// Altezza di riga dei testi del grafico: la usiamo per il riquadro che copre.
const LINE_HEIGHT = 18;

// polaris-viz usa 11px, 12 sui dispositivi tattili: replicato qui perche' la
// sua getFontSize non e' esposta e il numero arancione deve avere lo stesso
// corpo dei grigi che gli stanno sopra e sotto.
function axisFontSize(): number {
  if (typeof window === 'undefined') return 11;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 ? 12 : 11;
}

interface Props {
  series: DataSeries[];
  // Tetto dell'asse Y: forza polaris-viz a lasciare respiro sopra il limite del
  // piano (vedi computeChartYMax). undefined = auto-scale.
  maxY?: number;
  // Tacche dell'asse Y. Quando ci sono, il limite del piano e' una di loro.
  ticks?: number[];
  // Limite del piano: il suo numero sull'asse va in arancione. null = nessun
  // limite, nessun numero da evidenziare.
  limit?: number | null;
}

/**
 * Il numero del limite, in arancione, al posto del suo grigio.
 *
 * polaris-viz colora l'asse con un unico colore di tema, e non c'e' modo di
 * chiederne uno diverso per una sola tacca. Lo slot `chart` pero' passa la
 * stessa yScale con cui il grafico e' disegnato, e viene reso dopo l'asse:
 * basta ridisegnare quella tacca sopra la sua, con un riquadro del colore della
 * card a coprire quella sotto.
 */
function LimitTickLabel({ y, value }: { y: number; value: number }) {
  return (
    <g aria-hidden="true">
      {/* Copre il numero grigio sotto, come fa polaris-viz stesso dietro ogni
          etichetta. Largo quanto basta per i numeri che ci passano, non tanto
          da uscire dal grafico. */}
      <rect
        x={-90}
        y={y - LINE_HEIGHT / 2}
        width={90 + LABEL_RIGHT_EDGE}
        height={LINE_HEIGHT}
        fill="var(--p-color-bg-surface)"
      />
      <text
        x={LABEL_RIGHT_EDGE}
        y={y}
        textAnchor="end"
        dominantBaseline="middle"
        fill={LIMIT_COLOR}
        fontSize={axisFontSize()}
        fontFamily={FONT_FAMILY}
      >
        {value}
      </text>
    </g>
  );
}

export default function EligibilityChartCanvas({ series, maxY, ticks, limit }: Props) {
  return (
    // polaris-viz richiede un contenitore con altezza esplicita per disegnare:
    // nessun componente Polaris la impone, quindi qui lo style inline e' l'unica
    // eccezione ammessa al vincolo "solo Polaris".
    <div style={{ height: 260 }}>
      <PolarisVizProvider>
        <LineChart
          data={series}
          yAxisOptions={{
            ...(maxY != null ? { maxYOverride: maxY } : {}),
            ...(ticks != null ? { ticksOverride: ticks } : {}),
          }}
          slots={
            limit != null
              ? {
                  chart: ({ yScale }) => (
                    <LimitTickLabel y={yScale(limit)} value={limit} />
                  ),
                }
              : undefined
          }
        />
      </PolarisVizProvider>
    </div>
  );
}
