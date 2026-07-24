import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useNavigation } from '@remix-run/react';
import {
  Page,
  InlineGrid,
  Card,
  BlockStack,
  InlineStack,
  Box,
  Text,
  Badge,
  Button,
} from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { PLAN_CATALOG } from '~/components/Billing/plan-catalog';
import { PlanFeatureList } from '~/components/Billing/PlanFeatureList';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  // Normalizzato in minuscolo per combaciare con gli id del catalogo. Se il piano
  // corrente non e' tra i 4 (es. 'lifetime'), nessuna card risultera' "attuale".
  return json({ currentPlan: (shop?.currentPlan ?? '').toLowerCase() });
}

export default function Plan() {
  const { currentPlan } = useLoaderData<typeof loader>();

  // Stesso comportamento di Dashboard/Logs: spinner + disabilita mentre Remix
  // carica /settings/supabase.
  const navigation = useNavigation();
  const loadingSettings =
    navigation.state === 'loading' &&
    navigation.location?.pathname === '/settings/supabase';

  return (
    <Page
      title="Piano"
      secondaryActions={[
        {
          content: 'Impostazioni',
          icon: SettingsIcon,
          url: '/settings/supabase',
          accessibilityLabel: 'Impostazioni',
          disabled: loadingSettings,
          loading: loadingSettings,
        },
      ]}
    >
      <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
        {PLAN_CATALOG.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            // Pro risaltato con la superficie selezionata Polaris (niente CSS custom).
            <Card
              key={plan.id}
              background={plan.recommended ? 'bg-surface-selected' : undefined}
            >
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    {plan.name}
                  </Text>
                  {plan.recommended && <Badge tone="success">Consigliato</Badge>}
                  {isCurrent && <Badge tone="info">Piano attuale</Badge>}
                </InlineStack>

                <InlineStack gap="100" blockAlign="baseline">
                  <Text as="span" variant="headingLg">
                    €{plan.priceMonthly}
                  </Text>
                  <Text as="span" tone="subdued">
                    /mese
                  </Text>
                </InlineStack>

                <PlanFeatureList features={plan.features} />

                {/* CTA placeholder: nessuna azione reale finche' non colleghiamo
                    Shopify Billing (slice successiva). */}
                <Button
                  variant={plan.recommended ? 'primary' : undefined}
                  disabled={isCurrent}
                  fullWidth
                >
                  {isCurrent ? 'Piano attuale' : `Scegli ${plan.name}`}
                </Button>
              </BlockStack>
            </Card>
          );
        })}
      </InlineGrid>

      {/* Respiro in fondo, come le altre tab. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
