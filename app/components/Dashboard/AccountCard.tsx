import { useNavigation } from '@remix-run/react';
import { Card, BlockStack, Text, Button } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { planLabel, syncStatusBadge } from './account-format';

export interface AccountCardProps {
  planName: string;
  productsSyncActive: boolean;
  customersSyncActive: boolean;
  /**
   * Piano da proporre quando i clienti non sono inclusi (nome tecnico). Null
   * quando i clienti sono gia' inclusi o non c'e' un piano superiore da
   * proporre: in quel caso accanto al badge non compare nulla.
   */
  customersUpgradePlan?: string | null;
}

export function AccountCard({
  planName,
  productsSyncActive,
  customersSyncActive,
  customersUpgradePlan,
}: AccountCardProps) {
  // Stesso comportamento degli altri link della dashboard: mentre Remix carica
  // /plan il link mostra lo spinner e si disabilita.
  const navigation = useNavigation();
  const loadingPlan =
    navigation.state === 'loading' && navigation.location?.pathname === '/plan';

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Account
        </Text>
        <MetricRow label="Piano" badge={{ content: planLabel(planName) }} />
        <MetricRow
          label="Sincronizzazione prodotti"
          badge={syncStatusBadge(productsSyncActive)}
        />
        <MetricRow
          label="Sincronizzazione clienti"
          action={
            customersUpgradePlan ? (
              <Button
                variant="plain"
                url="/plan"
                disabled={loadingPlan}
                loading={loadingPlan}
              >
                {`Aggiorna a ${planLabel(customersUpgradePlan)}`}
              </Button>
            ) : undefined
          }
          badge={syncStatusBadge(customersSyncActive)}
        />
      </BlockStack>
    </Card>
  );
}
