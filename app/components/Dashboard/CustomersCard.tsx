import { Card, BlockStack, Text, Button, Box } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { useNavLoading } from './nav-loading';
import { useT } from '~/lib/i18n/context';

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
  const t = useT();
  const value = (n: number) => (loading ? '—' : String(n));

  // Stesso comportamento degli altri pulsanti-link della dashboard: mentre Remix
  // carica /plan il pulsante mostra lo spinner e si disabilita.
  const plan = useNavLoading('/plan');

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {t.dashboard.customers.title}
        </Text>

        {enabled ? (
          <BlockStack gap="300">
            <MetricRow
              label={t.dashboard.customers.total}
              badge={{ content: value(totalCustomers) }}
            />
            <MetricRow
              label={t.dashboard.customers.optIn}
              info={t.dashboard.customers.optInInfo}
              badge={{ tone: 'success', content: value(optIn) }}
            />
            <MetricRow
              label={t.dashboard.customers.optOut}
              info={t.dashboard.customers.optOutInfo}
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
                {t.dashboard.customers.upsell}
              </Text>
            </Box>
            {/* Un filo piu' in basso: stacca il pulsante dal testo sopra. */}
            <Box paddingBlockStart="200">
              <Button
                variant="primary"
                url="/plan"
                onClick={plan.start}
                disabled={plan.loading}
                loading={plan.loading}
              >
                {t.dashboard.customers.upgrade}
              </Button>
            </Box>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
