import { Banner, InlineStack, Button } from '@shopify/polaris';
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
  if (!plan.maxProducts) return null; // Unlimited plan

  const productUsagePercent = (currentUsage.products / plan.maxProducts) * 100;

  if (productUsagePercent < 80) return null; // Don't show until 80%

  return (
    <Banner tone={productUsagePercent >= 95 ? 'critical' : 'warning'}>
      <InlineStack align="space-between" blockAlign="center">
        <div>
          You're using {currentUsage.products}/{plan.maxProducts} products ({productUsagePercent.toFixed(0)}%)
          <br />
          Upgrade to {plan.planName === 'free' ? 'Pro' : 'Business'} to sync more products.
        </div>
        <Button url="/billing">View Plans</Button>
      </InlineStack>
    </Banner>
  );
}
