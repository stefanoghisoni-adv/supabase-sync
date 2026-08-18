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
import { useEffect, useRef, useState } from 'react';
import { LineChart, PolarisVizProvider, TooltipContent } from '@shopify/polaris-viz';
import { FONT_FAMILY } from '@shopify/polaris-viz-core';
import type { DataSeries } from '@shopify/polaris-viz-core';
import { pointDateLabel } from '~/lib/stats/history-series';
import { useLocale, useT } from '~/lib/i18n/context';
import { AXIS_PADDING_SERIES, ELIGIBLE_COLOR } from './EligibilityChart';

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
  // Primo giorno del mese mostrato (ISO): serve a scrivere la data per esteso
  // nel riquadro del punto, dove il solo numero del giorno non basta.
  monthStart?: string | null;
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
  const textRef = useRef<SVGTextElement>(null);
  // Scostamento orizzontale per incolonnare il numero arancione con i grigi.
  const [dx, setDx] = useState(0);

  // polaris-viz non allinea i numeri dell'asse a una coordinata dichiarata: li
  // ancora a sinistra partendo da una larghezza *stimata* del testo, con tabelle
  // di larghezze per carattere che non esporta. Ricalcolare quella posizione a
  // mano sarebbe indovinarla, e resterebbe indovinata anche dopo un loro
  // aggiornamento. La tacca grigia che stiamo coprendo pero' e' ancora li',
  // nell'SVG: la si misura e ci si incolonna, qualunque sia la regola che l'ha
  // messa dove sta.
  useEffect(() => {
    const el = textRef.current;
    const svg = el?.ownerSVGElement;
    if (!el || !svg) return;

    const mine = el.getBoundingClientRect();
    const twin = Array.from(svg.querySelectorAll('text')).find((node) => {
      if (node === el || node.textContent?.trim() !== String(value)) return false;
      // Stesso numero puo' comparire altrove (l'asse dei giorni): vale solo
      // quello alla stessa altezza, cioe' la tacca che stiamo sostituendo.
      const box = node.getBoundingClientRect();
      return Math.abs(box.top - mine.top) < LINE_HEIGHT;
    });
    if (!twin) return;

    const shift = twin.getBoundingClientRect().left - mine.left;
    // Sotto il mezzo pixel non si vede, e assestarsi evita un secondo giro.
    if (Math.abs(shift) > 0.5) setDx((current) => current + shift);
  }, [value, y]);

  return (
    <g aria-hidden="true">
      {/* Copre il numero grigio sotto, come fa polaris-viz stesso dietro ogni
          etichetta. Largo quanto basta per i numeri che ci passano, non tanto
          da uscire dal grafico. Non si sposta con il testo: incolonnandoci alla
          tacca grigia ci muoviamo verso sinistra, e un rettangolo che seguisse
          lascerebbe scoperta la coda del numero che deve nascondere. */}
      <rect
        x={-90}
        y={y - LINE_HEIGHT / 2}
        width={90 + LABEL_RIGHT_EDGE}
        height={LINE_HEIGHT}
        fill="var(--p-color-bg-surface)"
      />
      <text
        ref={textRef}
        transform={`translate(${dx},0)`}
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

/**
 * Legenda disegnata da noi.
 *
 * Quella di polaris-viz elenca tutte le serie, e fra queste c'e' quella che
 * serve solo ad alzare l'asse: comparirebbe come una voce senza nome. Non e'
 * filtrabile — `renderLegendContent` non riceve le voci, le si puo' solo
 * sostituire — quindi la scriviamo, ed e' il motivo per cui i colori delle due
 * serie sono dichiarati invece che ereditati dal tema.
 */
function ChartLegend({ hasLimit }: { hasLimit: boolean }) {
  const t = useT();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 'var(--p-space-500)',
        paddingBlockStart: 'var(--p-space-300)',
      }}
    >
      <LegendItem color={ELIGIBLE_COLOR} label={t.chart.title} />
      {hasLimit && <LegendItem color={LIMIT_COLOR} label={t.chart.planLimit} dashed />}
    </div>
  );
}

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--p-space-200)' }}>
      <svg width="16" height="2" aria-hidden="true">
        <line
          x1="0"
          y1="1"
          x2="16"
          y2="1"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span
        style={{
          font: 'var(--p-font-family-sans)',
          fontSize: 'var(--p-font-size-325)',
          color: 'var(--p-color-text-secondary)',
        }}
      >
        {label}
      </span>
    </span>
  );
}

export default function EligibilityChartCanvas({
  series,
  maxY,
  ticks,
  limit,
  monthStart,
}: Props) {
  const locale = useLocale();

  return (
    // polaris-viz richiede un contenitore con altezza esplicita per disegnare.
    // L'altezza non e' piu' un numero fisso ma quella che il corpo della card
    // lascia (vedi .chart-card__canvas in dashboard.css): con una misura fissa,
    // nelle card piu' basse il grafico eccedeva lo spazio e traboccava sopra il
    // titolo.
    <>
    <div className="chart-card__canvas">
      <PolarisVizProvider>
        <LineChart
          data={series}
          showLegend={false}
          yAxisOptions={{
            ...(maxY != null ? { maxYOverride: maxY } : {}),
            ...(ticks != null ? { ticksOverride: ticks } : {}),
          }}
          // Riquadro del punto disegnato da noi, con il componente di
          // polaris-viz: il suo formattatore scarta le righe senza valore, e sui
          // giorni non ancora arrivati "Prodotti sincronizzabili" sparirebbe
          // invece di dire che li' un dato non c'e'.
          tooltipOptions={{
            renderTooltipContent: (tooltip) => (
              <TooltipContent
                theme={tooltip.theme}
                title={pointDateLabel(tooltip.title ?? '', monthStart, locale)}
                data={tooltip.data.map((series) => ({
                  shape: series.shape,
                  name: series.name,
                  // Il filtro va QUI, sulle righe, non sui gruppi: le voci del
                  // riquadro sono i punti, e ciascuno porta come chiave il nome
                  // della propria serie. Filtrando il gruppo, quella di appoggio
                  // restava — e mostrava "__axis_padding__ 15" a video.
                  data: series.data
                    .filter((point) => String(point.key) !== AXIS_PADDING_SERIES)
                    .map((point) => ({
                      ...point,
                      key: String(point.key),
                      value: point.value == null ? '—' : String(point.value),
                    })),
                }))}
              />
            ),
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
    {/* Fuori dal contenitore del grafico: dentro, gliela toglierebbe
        dall'altezza — e' quel contenitore a prendersi lo spazio che avanza. */}
    <ChartLegend hasLimit={limit != null} />
    </>
  );
}
