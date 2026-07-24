import { BlockStack, InlineStack, Icon, Text } from '@shopify/polaris';
import { CheckIcon, XIcon } from '@shopify/polaris-icons';
import type { PlanFeature } from './plan-catalog';
import { sortFeatures } from './plan-features';

interface Props {
  features: PlanFeature[];
}

// Feature incluse in verde con la spunta, non incluse in grigio con la X; le
// verdi vengono ordinate in alto da sortFeatures.
export function PlanFeatureList({ features }: Props) {
  const sorted = sortFeatures(features);
  return (
    <BlockStack gap="200">
      {sorted.map((feature, index) => (
        <InlineStack key={`${feature.label}-${index}`} gap="200" blockAlign="center" wrap={false}>
          <Icon
            source={feature.included ? CheckIcon : XIcon}
            tone={feature.included ? 'success' : 'subdued'}
          />
          <Text as="span" tone={feature.included ? 'success' : 'subdued'}>
            {feature.label}
          </Text>
        </InlineStack>
      ))}
    </BlockStack>
  );
}
