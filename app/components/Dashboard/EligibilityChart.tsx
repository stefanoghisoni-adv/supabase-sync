import { useState, useEffect, lazy, Suspense, Component } from 'react';
import type { ReactNode } from 'react';
import { Card, Text, BlockStack, Box } from '@shopify/polaris';
import { computeChartYMax, computeChartYTicks } from './chart-scale';

// Import DINAMICO: il modulo che contiene polaris-viz non deve finire nel grafo
// del server. Su Vercel il suo build CJS fa require('d3-scale'), che e' ESM-only,
// e l'intero runtime muore con ERR_REQUIRE_ESM prima di servire qualunque pagina.
// Con lazy() il chunk viene chiesto solo dal browser, dopo l'idratazione.
const EligibilityChartCanvas = lazy(() => import('./EligibilityChartCanvas'));

// Il tipo del canvas non si importa da polaris-viz-core: basterebbe un import
// type per riportare il pacchetto nel grafo. Qui serve solo la forma dei dati.
interface ChartSeries {
  name: string;
  data: { key: string; value: number | null }[];
  color?: string;
  styleOverride?: { line: { strokeDasharray: string; width: number; hasArea: boolean } };
}

interface EligibilityPoint {
  /** Giorno del mese, da 1 all'ultimo. */
  day: number;
  /** null = giorno non ancora arrivato. */
  count: number | null;
}

interface EligibilityChartProps {
  points: EligibilityPoint[];
  /** Mese mostrato sull'asse, es. "Agosto 2026". */
  monthLabel?: string;
  planLimit: number | null;
  loading: boolean;
}

// Il chunk del grafico viene scaricato a parte, dopo l'idratazione: se quella
// richiesta fallisce (rete, deploy appena aggiornato, chunk non piu' presente)
// l'errore risalirebbe fino all'ErrorBoundary di root e porterebbe giu' l'intera
// dashboard per un riquadro secondario. Qui lo fermiamo: il resto della pagina
// resta usabile e al posto del grafico compare una riga di testo.
// E' una class component perche' React non offre altro modo di intercettare un
// errore di render; l'interfaccia che rende resta Polaris.
class ChartErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[EligibilityChart] caricamento del grafico fallito:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <Text as="p" tone="subdued">
          Grafico non disponibile al momento. Ricarica la pagina per riprovare.
        </Text>
      );
    }
    return this.props.children;
  }
}

// Titolo e sottotitolo sono identici in tutti gli stati: la Card non deve
// cambiare forma mentre i dati arrivano. Le due classi servono a far riempire
// alla card l'altezza della riga e a tenere il grafico in mezzo (vedi
// dashboard.css): l'altra colonna e' piu' alta e senza questo il grafico
// resterebbe schiacciato in cima.
function ChartCard({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="chart-card">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Prodotti sincronizzabili
          </Text>
          <Text as="p" tone="subdued">
            {subtitle}
          </Text>
        </BlockStack>
        <div className="chart-card__body">{children}</div>
      </Card>
    </div>
  );
}

export function EligibilityChart({
  points,
  monthLabel,
  planLimit,
  loading,
}: EligibilityChartProps) {
  // Il grafico esiste solo nel browser: in SSR si rende lo scheletro.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Attesa "a riquadro", come i grafici di Analisi di Shopify: righe di testo
  // finte prometterebbero un elenco, qui invece sta arrivando un grafico.
  const skeleton = (
    <Box background="bg-surface-secondary" borderRadius="200" minHeight="260px" />
  );
  // Finche' i dati non arrivano il mese non e' noto: il sottotitolo dice
  // comunque che cosa si stara' guardando.
  const subtitle = monthLabel ?? 'Mese corrente';

  if (loading || !mounted) {
    return <ChartCard subtitle={subtitle}>{skeleton}</ChartCard>;
  }

  // Nessuno snapshot ancora: lo storico si costruisce un giorno alla volta.
  // Con un solo punto il grafico si disegna comunque (un marker isolato).
  if (points.length === 0) {
    return (
      <ChartCard subtitle={subtitle}>
        <Text as="p" tone="subdued">
          Lo storico si costruisce da qui in avanti, un punto al giorno.
        </Text>
      </ChartCard>
    );
  }

  // Le chiavi sono i giorni del mese: l'asse orizzontale va dal primo
  // all'ultimo, cosi' si vede in che punto del mese il numero e' cambiato.
  const series: ChartSeries[] = [
    {
      name: 'Prodotti sincronizzabili',
      data: points.map((p) => ({ key: String(p.day), value: p.count })),
    },
  ];

  // La soglia del piano e' una seconda serie costante, non una Annotation: le
  // Annotation di polaris-viz non espongono il colore, una serie si'.
  if (planLimit != null) {
    series.push({
      name: 'Limite del piano',
      data: points.map((p) => ({ key: String(p.day), value: planLimit })),
      color: '#FF8A00',
      styleOverride: { line: { strokeDasharray: '6 4', width: 2, hasArea: false } },
    });
  }

  // Con un tetto di piano l'asse lo dettano le tacche: il limite dev'essere una
  // di loro (e' quella che si scrive in arancione) e sopra deve restarci
  // margine, cosi' la tratteggiata non finisce incollata al bordo superiore.
  // Senza tetto non c'e' nulla da far cadere su una tacca e basta il massimo.
  const maxData = points.reduce((m, p) => Math.max(m, p.count ?? 0), 0);
  const ticks = computeChartYTicks(planLimit, maxData);
  const maxY = ticks ? ticks[ticks.length - 1] : computeChartYMax(planLimit, maxData);

  return (
    <ChartCard subtitle={subtitle}>
      <ChartErrorBoundary>
        <Suspense fallback={skeleton}>
          <EligibilityChartCanvas
            series={series}
            maxY={maxY}
            ticks={ticks}
            limit={planLimit}
          />
        </Suspense>
      </ChartErrorBoundary>
    </ChartCard>
  );
}
