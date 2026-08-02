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
   * proporre: in quel caso la riga torna al badge.
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

  const upgrade = !customersSyncActive && Boolean(customersUpgradePlan);

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
          // L'invito all'upgrade prende il posto del badge "Non attiva": dice la
          // stessa cosa e in piu' dice cosa farci. Il badge resta quando la sync
          // e' attiva, o quando non c'e' nessun piano da proporre — altrimenti
          // la riga rimarrebbe senza risposta.
          action={
            upgrade ? (
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
          badge={upgrade ? undefined : syncStatusBadge(customersSyncActive)}
        />
      </BlockStack>
    </Card>
  );
}
