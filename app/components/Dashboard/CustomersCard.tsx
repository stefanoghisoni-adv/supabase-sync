import { useNavigation } from '@remix-run/react';
import { Card, BlockStack, Text, Button, Box } from '@shopify/polaris';
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

  // Stesso comportamento degli altri pulsanti-link della dashboard: mentre Remix
  // carica /plan il pulsante mostra lo spinner e si disabilita.
  const navigation = useNavigation();
  const loadingPlan =
    navigation.state === 'loading' && navigation.location?.pathname === '/plan';

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
            <Box paddingInline="400">
              <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                Potenzia la trasmissione dei dati utente monitorando anche il
                Lifetime Value (LTV) e Lifetime Profit (LTP).
              </Text>
            </Box>
            {/* Un filo piu' in basso: stacca il pulsante dal testo sopra. */}
            <Box paddingBlockStart="200">
              <Button
                variant="primary"
                url="/plan"
                disabled={loadingPlan}
                loading={loadingPlan}
              >
                Aggiorna piano
              </Button>
            </Box>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
