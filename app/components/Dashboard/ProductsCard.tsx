import { Card, BlockStack, Text, Button } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { problemRowPresentation } from './product-rows';
import { productQuotaLabel } from './product-quota';

export interface ProductsCardProps {
  readyCount: number;
  problemCount: number;
  /** Tetto di prodotti del piano; null = nessun tetto (si scrive ∞). */
  planLimit?: number | null;
  loading: boolean;
  onViewIssues: () => void;
}

export function ProductsCard({
  readyCount,
  problemCount,
  planLimit,
  loading,
  onViewIssues,
}: ProductsCardProps) {
  // Il totale e' la somma per costruzione: idonei + non idonei.
  const total = readyCount + problemCount;
  const { tone, showLink } = problemRowPresentation(problemCount);
  const value = (n: number) => (loading ? '—' : String(n));

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Prodotti
        </Text>
        <MetricRow label="Prodotti totali" badge={{ content: value(total) }} />
        <MetricRow
          label="Non idonei"
          action={
            showLink && !loading ? (
              <Button variant="plain" onClick={onViewIssues}>
                Vedi prodotti
              </Button>
            ) : undefined
          }
          badge={{ tone, content: value(problemCount) }}
        />
        {/* Ultima riga, come conclusione delle due sopra: e' il numero che
            conta davvero. Accanto, il tetto del piano — il conteggio da solo
            non dice quanto margine resta. */}
        <MetricRow
          label="Prodotti idonei"
          badge={{
            tone: 'success',
            content: loading ? '—' : productQuotaLabel(readyCount, planLimit),
          }}
        />
      </BlockStack>
    </Card>
  );
}
