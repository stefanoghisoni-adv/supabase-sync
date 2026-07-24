import { Card, BlockStack, Text, Button, Tooltip, Box } from '@shopify/polaris';
import { MetricRow } from './MetricRow';

const OPT_IN_INFO = 'Qui vengono identificati i clienti che hanno acconsentito al marketing';
const OPT_OUT_INFO = 'Qui vengono identificati i clienti che non hanno acconsentito al marketing';

export interface CustomersCardProps {
  enabled: boolean;
  totalCustomers: number;
  optIn: number;
  optOut: number;
  loading: boolean;
}

export function CustomersCard({
  enabled,
  totalCustomers,
  optIn,
  optOut,
  loading,
}: CustomersCardProps) {
  const value = (n: number) => (loading ? '—' : String(n));

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Clienti
        </Text>

        {enabled ? (
          <BlockStack gap="300">
            <MetricRow label="Clienti totali" badge={{ content: value(totalCustomers) }} />
            <MetricRow
              label="Clienti opt-in"
              info={OPT_IN_INFO}
              badge={{ tone: 'success', content: value(optIn) }}
            />
            <MetricRow
              label="Clienti opt-out"
              info={OPT_OUT_INFO}
              badge={{ content: value(optOut) }}
            />
          </BlockStack>
        ) : (
          // Piano senza sync clienti: i dati non si mostrano affatto, nemmeno
          // velati. Non avendo nulla da nascondere spariscono sia l'overlay in
          // CSS sia il contenuto inerte da rendere inaccessibile: resta solo
          // l'invito all'upgrade, tutto in Polaris.
          <BlockStack gap="200" inlineAlign="center">
            <Tooltip content="Presto disponibile">
              <Button variant="primary" disabled>
                Aggiorna piano
              </Button>
            </Tooltip>
            <Box paddingInline="400">
              <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                Potenzia la trasmissione dei dati utente monitorando anche il
                lifetime value (LTV) e lifetime profit (LTP).
              </Text>
            </Box>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
