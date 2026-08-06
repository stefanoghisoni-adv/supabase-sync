import { Card, BlockStack, Text, Button } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { problemRowPresentation } from './product-rows';
import { productQuotaLabel } from './product-quota';
import { useNavLoading } from './nav-loading';

const ISSUES_PATH = '/products/issues';

export interface ProductsCardProps {
  readyCount: number;
  problemCount: number;
  /** Tetto di prodotti del piano; null = nessun tetto (si scrive ∞). */
  planLimit?: number | null;
  loading: boolean;
}

export function ProductsCard({
  readyCount,
  problemCount,
  planLimit,
  loading,
}: ProductsCardProps) {
  // La pagina dei prodotti non idonei interroga Shopify pagina per pagina, quindi
  // l'attesa si sente. Senza un segnale il merchant clicca una seconda volta,
  // convinto che il primo clic non sia arrivato.
  const issues = useNavLoading(ISSUES_PATH);

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
              <Button
                variant="plain"
                url={ISSUES_PATH}
                onClick={issues.start}
                disabled={issues.loading}
                loading={issues.loading}
              >
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
