import type { ReactNode } from 'react';
import { InlineStack, Badge, Text, Icon, Tooltip } from '@shopify/polaris';
import { InfoIcon } from '@shopify/polaris-icons';

export interface MetricRowProps {
  label: string;
  badge: { tone?: 'success' | 'warning'; content: string };
  info?: string;
  action?: ReactNode;
}

// Riga singola delle card della dashboard: etichetta (con eventuale info),
// azione opzionale, badge. Estratta perche' si ripete identica nelle tre card e
// tiene i badge allineati sulla stessa colonna.
export function MetricRow({ label, badge, info, action }: MetricRowProps) {
  return (
    <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
      <InlineStack gap="100" blockAlign="center" wrap={false}>
        <Text as="span" variant="bodyMd">
          {label}
        </Text>
        {info ? (
          <Tooltip content={info}>
            <Icon source={InfoIcon} tone="subdued" />
          </Tooltip>
        ) : null}
      </InlineStack>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        {action}
        <Badge tone={badge.tone}>{badge.content}</Badge>
      </InlineStack>
    </InlineStack>
  );
}
