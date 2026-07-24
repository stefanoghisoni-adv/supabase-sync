import { useState, useEffect } from 'react';
import { Card, Text, BlockStack, SkeletonBodyText } from '@shopify/polaris';
import { LineChart, PolarisVizProvider } from '@shopify/polaris-viz';
import type { DataSeries } from '@shopify/polaris-viz-core';

interface EligibilityPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

interface EligibilityChartProps {
  points: EligibilityPoint[];
  planLimit: number | null;
  loading: boolean;
}

export function EligibilityChart({ points, planLimit, loading }: EligibilityChartProps) {
  // polaris-viz tocca window in fase di render: in SSR fallirebbe con
  // "window is not defined". Si monta solo dopo l'idratazione, con uno
  // SkeletonBodyText al posto suo nel frattempo.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lo skeleton si mostra durante il caricamento iniziale O prima dell'idratazione.
  if (loading || !mounted) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Prodotti sincronizzabili
          </Text>
          <Text as="p" tone="subdued">
            Ultimi 30 giorni
          </Text>
          <div style={{ height: 260 }}>
            <SkeletonBodyText lines={8} />
          </div>
        </BlockStack>
      </Card>
    );
  }

  // Stato vuoto: nessuno snapshot ancora. Con un solo punto il grafico si disegna
  // comunque (un marker isolato): va bene, non è un caso speciale.
  if (points.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Prodotti sincronizzabili
          </Text>
          <Text as="p" tone="subdued">
            Ultimi 30 giorni
          </Text>
          <Text as="p" tone="subdued">
            Lo storico si costruisce da qui in avanti, un punto al giorno.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  // Serie principale: i prodotti sincronizzabili.
  const series: DataSeries[] = [
    {
      name: 'Prodotti sincronizzabili',
      data: points.map((p) => ({ key: p.day, value: p.count })),
    },
  ];

  // La soglia del piano come seconda serie costante (non Annotation: le Annotation
  // non espongono il colore, mentre una serie sì).
  if (planLimit != null) {
    series.push({
      name: 'Limite del piano',
      data: points.map((p) => ({ key: p.day, value: planLimit })),
      color: '#FF8A00',
      styleOverride: { line: { strokeDasharray: '6 4', width: 2, hasArea: false } },
    });
  }

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">
          Prodotti sincronizzabili
        </Text>
        <Text as="p" tone="subdued">
          Ultimi 30 giorni
        </Text>
        {/* polaris-viz richiede un contenitore con altezza esplicita per disegnare:
            nessun componente Polaris lo fornisce, quindi un div con style inline
            è l'unica eccezione ammessa ai vincoli "solo Polaris". */}
        <div style={{ height: 260 }}>
          <PolarisVizProvider>
            <LineChart data={series} />
          </PolarisVizProvider>
        </div>
      </BlockStack>
    </Card>
  );
}
