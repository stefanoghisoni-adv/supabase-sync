import { Card, Text, BlockStack, SkeletonBodyText } from '@shopify/polaris';

type StatsStatus = 'success' | 'warning' | 'critical';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  status?: StatsStatus;
  loading?: boolean;
}

// Polaris <Text> uses "caution" rather than "warning" for its tone scale.
const TONE_BY_STATUS: Record<StatsStatus, 'success' | 'caution' | 'critical'> = {
  success: 'success',
  warning: 'caution',
  critical: 'critical',
};

export function StatsCard({ title, value, icon, status, loading }: StatsCardProps) {
  return (
    <Card>
      <BlockStack gap="200">
        {icon}
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {loading ? (
          <SkeletonBodyText lines={1} />
        ) : (
          <Text
            as="p"
            variant="heading2xl"
            tone={status ? TONE_BY_STATUS[status] : undefined}
          >
            {String(value)}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
