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
  Banner,
} from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { buildPlanCards, formatPrice, type PlanCard } from '~/components/Billing/plan-catalog';
import { shouldHighlightRecommended } from '~/components/Billing/plan-highlight';
import { canAccessPlanTab } from '~/components/Billing/plan-access';
import { PlanFeatureList } from '~/components/Billing/PlanFeatureList';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  // Normalizzato in minuscolo per combaciare con gli id del catalogo. Se il piano
  // corrente non e' tra i 4 (es. 'lifetime'), nessuna card risultera' "attuale".
  const currentPlan = (shop?.currentPlan ?? '').toLowerCase();

  // Il link sparisce dalla NavMenu, ma /plan resta digitabile: il blocco vero sta
  // qui. 403 anche nello status, non solo a schermo.
  if (!canAccessPlanTab(currentPlan)) {
    return json(
      { currentPlan, blocked: true as const, cards: [] as PlanCard[] },
      { status: 403 },
    );
  }

  // Le card vengono dal listino registrato, non da una copia nel codice: nomi,
  // prezzi e limiti sono quelli che l'app applica davvero.
  const plans = await prisma.plan.findMany();
  const cards = buildPlanCards(
    plans.map((plan) => ({
      planName: plan.planName,
      priceMonthly: Number(plan.priceMonthly),
      maxProducts: plan.maxProducts,
      maxCustomers: plan.maxCustomers,
      maxSyncFrequencyHours: plan.maxSyncFrequencyHours,
      customersSyncEnabled: plan.customersSyncEnabled,
      supportLevel: plan.supportLevel,
    })),
  );

  return json({ currentPlan, blocked: false as const, cards });
}

export default function Plan() {
  const { currentPlan, blocked, cards } = useLoaderData<typeof loader>();

  // Il "Consigliato" si risalta solo se e' un upgrade rispetto al piano attuale.
  const highlightRecommended = shouldHighlightRecommended(cards, currentPlan);

  // Stesso comportamento di Dashboard/Logs: spinner + disabilita mentre Remix
  // carica /settings/supabase.
  const navigation = useNavigation();
  const loadingSettings =
    navigation.state === 'loading' &&
    navigation.location?.pathname === '/settings/supabase';

  // Sezione non disponibile: pagina vuota, ritorno alla dashboard e avviso rosso.
  // Nessuna card e nessun prezzo, cosi' non si suggerisce un upgrade che non serve.
  if (blocked) {
    return (
      <Page title="Piano" backAction={{ url: '/', content: 'Dashboard' }}>
        <Banner tone="critical" title="Non hai accesso a questa sezione">
          <Text as="p">
            Il tuo piano è senza limiti e non prevede rinnovi: non c'è nessun
            aggiornamento da fare. Torna alla dashboard per continuare.
          </Text>
        </Banner>
        <Box paddingBlockEnd="800" />
      </Page>
    );
  }

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
            cosa NON cambia al cambio di piano (dubbio tipico prima di pagare).
            Copy solo in termini di beneficio per il merchant: nessun riferimento a
            come l'app funziona dietro le quinte. */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Scegli il piano adatto al tuo store
            </Text>
            <Text as="p" tone="subdued">
              Più prodotti coperti, aggiornamenti più frequenti e dati cliente sempre
              allineati: salendo di piano il tuo tracking lavora su informazioni più
              fresche e complete, con campagne e report più affidabili.
            </Text>
            <Text as="p" tone="subdued">
              Cambiando piano non perdi quello che hai già raccolto: cambiano solo i
              limiti, la frequenza di aggiornamento e le funzioni incluse.
            </Text>
          </BlockStack>
        </Card>

        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          {cards.map((plan) => {
            const isCurrent = plan.name.trim().toLowerCase() === currentPlan;
            const isHighlighted = plan.recommended && highlightRecommended;
            return (
              // Il consigliato non ha uno sfondo diverso (sembrava disabilitato) ma un
              // bordo piu' spesso nello stesso colore del pulsante primario. Polaris non
              // espone bordi sulla Card: outline su un wrapper (non occupa spazio, quindi
              // la card non si restringe) con il raggio della Card. display:grid fa
              // stirare la Card all'altezza della riga, come le altre colonne.
              <div
                key={plan.name}
                style={{
                  display: 'grid',
                  height: '100%',
                  borderRadius: 'var(--p-border-radius-300)',
                  outline: isHighlighted
                    ? '2px solid var(--p-color-bg-fill-brand)'
                    : undefined,
                }}
              >
                <Card padding="500">
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
                          <Text as="span" variant="heading3xl">
                            €{formatPrice(plan.priceMonthly)}
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
              </div>
            );
          })}
        </InlineGrid>

        <Text as="p" tone="subdued" variant="bodySm" alignment="center">
          L'addebito avviene tramite Shopify, insieme alla fattura del tuo negozio, e
          puoi cambiare o disdire il piano quando vuoi.
        </Text>
      </BlockStack>

      {/* Respiro in fondo, come le altre tab. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
