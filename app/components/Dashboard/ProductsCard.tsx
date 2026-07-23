import { Card, BlockStack, Text, Button } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { problemRowPresentation } from './product-rows';

export interface ProductsCardProps {
  readyCount: number;
  problemCount: number;
  loading: boolean;
  onViewIssues: () => void;
}

export function ProductsCard({
  readyCount,
  problemCount,
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
          label="Prodotti idonei"
          badge={{ tone: 'success', content: value(readyCount) }}
        />
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
      </BlockStack>
    </Card>
  );
}
