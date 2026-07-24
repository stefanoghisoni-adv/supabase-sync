import { useState, useEffect, lazy, Suspense, Component } from 'react';
import type { ReactNode } from 'react';
import { Card, Text, BlockStack, SkeletonBodyText } from '@shopify/polaris';
import { computeChartYMax } from './chart-scale';

// Import DINAMICO: il modulo che contiene polaris-viz non deve finire nel grafo
// del server. Su Vercel il suo build CJS fa require('d3-scale'), che e' ESM-only,
// e l'intero runtime muore con ERR_REQUIRE_ESM prima di servire qualunque pagina.
// Con lazy() il chunk viene chiesto solo dal browser, dopo l'idratazione.
const EligibilityChartCanvas = lazy(() => import('./EligibilityChartCanvas'));

// Il tipo del canvas non si importa da polaris-viz-core: basterebbe un import
// type per riportare il pacchetto nel grafo. Qui serve solo la forma dei dati.
interface ChartSeries {
  name: string;
  data: { key: string; value: number }[];
  color?: string;
  styleOverride?: { line: { strokeDasharray: string; width: number; hasArea: boolean } };
}

interface EligibilityPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

interface EligibilityChartProps {
  points: EligibilityPoint[];
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
// cambiare forma mentre i dati arrivano.
function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">
          Prodotti sincronizzabili
        </Text>
        <Text as="p" tone="subdued">
          Ultimi 30 giorni
        </Text>
        {children}
      </BlockStack>
    </Card>
  );
}

export function EligibilityChart({ points, planLimit, loading }: EligibilityChartProps) {
  // Il grafico esiste solo nel browser: in SSR si rende lo scheletro.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const skeleton = <SkeletonBodyText lines={8} />;

  if (loading || !mounted) {
    return <ChartCard>{skeleton}</ChartCard>;
  }

  // Nessuno snapshot ancora: lo storico si costruisce un giorno alla volta.
  // Con un solo punto il grafico si disegna comunque (un marker isolato).
  if (points.length === 0) {
    return (
      <ChartCard>
        <Text as="p" tone="subdued">
          Lo storico si costruisce da qui in avanti, un punto al giorno.
        </Text>
      </ChartCard>
    );
  }

  const series: ChartSeries[] = [
    {
      name: 'Prodotti sincronizzabili',
      data: points.map((p) => ({ key: p.day, value: p.count })),
    },
  ];

  // La soglia del piano e' una seconda serie costante, non una Annotation: le
  // Annotation di polaris-viz non espongono il colore, una serie si'.
  if (planLimit != null) {
    series.push({
      name: 'Limite del piano',
      data: points.map((p) => ({ key: p.day, value: planLimit })),
      color: '#FF8A00',
      styleOverride: { line: { strokeDasharray: '6 4', width: 2, hasArea: false } },
    });
  }

  // Tetto dell'asse Y sopra il limite del piano: senza, la linea tratteggiata
  // arancione cadrebbe sul bordo superiore (con 3 sincronizzabili su un limite
  // di 100 sarebbe quasi invisibile). Con il tetto un po' piu' alto resta a mezza
  // altezza e ben leggibile.
  const maxData = points.reduce((m, p) => Math.max(m, p.count), 0);
  const maxY = computeChartYMax(planLimit, maxData);

  return (
    <ChartCard>
      <ChartErrorBoundary>
        <Suspense fallback={skeleton}>
          <EligibilityChartCanvas series={series} maxY={maxY} />
        </Suspense>
      </ChartErrorBoundary>
    </ChartCard>
  );
}
