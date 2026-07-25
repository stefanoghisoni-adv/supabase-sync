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
import { shouldHighlightRecommended } from '~/components/Billing/plan-highlight';
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

  // Il "Consigliato" si risalta solo se e' un upgrade rispetto al piano attuale.
  const highlightRecommended = shouldHighlightRecommended(currentPlan);

  // Stesso comportamento di Dashboard/Logs: spinner + disabilita mentre Remix
  // carica /settings/supabase.
  const navigation = useNavigation();
  const loadingSettings =
    navigation.state === 'loading' &&
    navigation.location?.pathname === '/settings/supabase';

  return (
    <Page
      title="Piano"
      backAction={{ url: '/', content: 'Dashboard' }}
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
      <BlockStack gap="500">
        {/* Intestazione informativa: riempie lo spazio sopra la griglia e dice
            cosa NON cambia al cambio di piano (dubbio tipico prima di pagare). */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Scegli il piano adatto al tuo store
            </Text>
            <Text as="p" tone="subdued">
              Tutti i piani sincronizzano i prodotti nel tuo progetto Supabase, con RLS
              attiva e accesso in sola lettura tramite proxy. Cambiando piano i dati già
              sincronizzati restano nel tuo database: cambiano solo i limiti, la frequenza
              di aggiornamento e le funzioni disponibili.
            </Text>
          </BlockStack>
        </Card>

        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          {PLAN_CATALOG.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isHighlighted = plan.recommended && highlightRecommended;
            return (
              // Il consigliato usa la superficie "emphasis" (azzurrino tenue): la
              // "selected" era grigia e faceva sembrare la card disabilitata.
              <Card
                key={plan.id}
                background={isHighlighted ? 'bg-surface-emphasis' : undefined}
                padding="500"
              >
                {/* Colonna a tutta altezza con la CTA spinta in fondo. La garanzia
                    vera dell'allineamento e' che tutte le card elencano le stesse 6
                    righe senza andare a capo, quindi hanno la stessa altezza: il
                    flex e' la rete di sicurezza. Polaris non espone un "pin in
                    basso", questi style inline sono l'eccezione gia' adottata per
                    il contenitore del grafico. */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <BlockStack gap="500">
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Text as="h2" variant="headingMd">
                          {plan.name}
                        </Text>
                        {isHighlighted && <Badge tone="success">Consigliato</Badge>}
                        {isCurrent && <Badge tone="info">Piano attuale</Badge>}
                      </InlineStack>

                      <InlineStack gap="100" blockAlign="baseline">
                        <Text as="span" variant="heading2xl">
                          €{plan.priceMonthly}
                        </Text>
                        <Text as="span" tone="subdued">
                          /mese
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <PlanFeatureList features={plan.features} />
                  </BlockStack>

                  {/* marginBlockStart:auto tiene la CTA in fondo alla colonna anche
                      se il contenuto sopra e' piu' corto. CTA placeholder finche'
                      non colleghiamo Shopify Billing (slice successiva). */}
                  <div style={{ marginBlockStart: 'auto', paddingBlockStart: 'var(--p-space-500)' }}>
                    <Button
                      variant={isHighlighted ? 'primary' : undefined}
                      disabled={isCurrent}
                      fullWidth
                    >
                      {isCurrent ? 'Piano attuale' : `Scegli ${plan.name}`}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </InlineGrid>

        <Text as="p" tone="subdued" variant="bodySm" alignment="center">
          Prezzi mensili in euro, IVA esclusa. L'addebito avviene tramite Shopify, insieme
          alla fattura del tuo negozio, e puoi cambiare o disdire il piano quando vuoi.
        </Text>
      </BlockStack>

      {/* Respiro in fondo, come le altre tab. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
