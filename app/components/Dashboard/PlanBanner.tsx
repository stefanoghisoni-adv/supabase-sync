import { Banner, BlockStack, Text } from '@shopify/polaris';
import type { SerializeFrom } from '@remix-run/node';
import type { Shop, Plan } from '@prisma/client';

interface PlanBannerProps {
  shop: SerializeFrom<Shop>;
  plan: SerializeFrom<Plan>;
  currentUsage: {
    products: number;
    customers: number;
    customFields: number;
  };
}

export function PlanBanner({ plan, currentUsage }: PlanBannerProps) {
  if (!plan.maxProducts) return null; // Piano senza tetto: niente da avvisare.

  const productUsagePercent = (currentUsage.products / plan.maxProducts) * 100;

  // Sotto l'80% il tetto non e' una notizia: l'avviso comparirebbe sempre e
  // smetterebbe di farsi leggere.
  if (productUsagePercent < 80) return null;

  return (
    <Banner
      tone={productUsagePercent >= 95 ? 'critical' : 'warning'}
      // Il piano da consigliare non si indovina dal nome di quello in uso: il
      // listino cambia. La tab Piano mostra le opzioni disponibili in quel
      // momento.
      action={{ content: 'Vedi i piani', url: '/plan' }}
    >
      <BlockStack gap="100">
        <Text as="p">
          Stai usando {currentUsage.products} prodotti su {plan.maxProducts} previsti dal
          tuo piano ({productUsagePercent.toFixed(0)}%).
        </Text>
        <Text as="p">
          Aggiorna il piano per sincronizzare più prodotti.
        </Text>
      </BlockStack>
    </Banner>
  );
}
