import { Card, BlockStack, Text } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { planLabel, syncFrequencyLabel } from './account-format';

export interface AccountCardProps {
  connected: boolean;
  planName: string;
  syncFrequencyHours: number | null;
}

export function AccountCard({ connected, planName, syncFrequencyHours }: AccountCardProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Account
        </Text>
        <MetricRow
          label="Database"
          badge={{
            tone: connected ? 'success' : undefined,
            content: connected ? 'Collegato' : 'Non collegato',
          }}
        />
        <MetricRow label="Piano" badge={{ content: planLabel(planName) }} />
        <MetricRow
          label="Frequenza sync"
          badge={{ content: syncFrequencyLabel(syncFrequencyHours) }}
        />
      </BlockStack>
    </Card>
  );
}
