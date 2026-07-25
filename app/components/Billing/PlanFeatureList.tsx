import { BlockStack, InlineStack, Icon, Text } from '@shopify/polaris';
import { CheckIcon, XIcon } from '@shopify/polaris-icons';
import type { PlanFeature } from './plan-catalog';
import { sortFeatures } from './plan-features';

interface Props {
  features: PlanFeature[];
}

// Feature incluse in verde con la spunta, non incluse in grigio con la X; le
// verdi vengono ordinate in alto da sortFeatures (no-op sul catalogo attuale,
// che le elenca gia' in quest'ordine per tenere allineate le 4 card).
// wrap={false} tiene icona e testo sulla stessa riga: che la label non vada a
// capo dipende invece dalla sua lunghezza, verificata nei test del catalogo.
export function PlanFeatureList({ features }: Props) {
  const sorted = sortFeatures(features);
  return (
    <BlockStack gap="300" inlineAlign="start">
      {sorted.map((feature) => (
        <InlineStack key={feature.key} align="start" gap="200" blockAlign="center" wrap={false}>
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
