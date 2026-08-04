import { Banner, BlockStack, InlineStack, Text, Button } from '@shopify/polaris';
import { productLimitMessage } from './product-quota';
import { useNavLoading } from './nav-loading';

export interface PlanLimitBannerProps {
  /** Prodotti idonei conteggiati ora. */
  count: number;
  /** Tetto del piano; null = nessun tetto, nessun avviso. */
  limit: number | null;
}

/**
 * Avviso di quota prodotti in esaurimento.
 *
 * Non si chiude: finche' la quota e' quella, la cosa resta vera e il merchant
 * deve continuare a vederla. Sparisce da se' quando il tetto sale o i prodotti
 * idonei scendono sotto la soglia.
 */
export function PlanLimitBanner({ count, limit }: PlanLimitBannerProps) {
  const plan = useNavLoading('/plan');

  const message = productLimitMessage(count, limit);
  if (!message) return null;

  return (
    <Banner tone="warning">
      <BlockStack gap="200">
        <Text as="p">{message}</Text>
        <InlineStack>
          <Button
            url="/plan"
            onClick={plan.start}
            disabled={plan.loading}
            loading={plan.loading}
          >
            Aggiorna piano
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
