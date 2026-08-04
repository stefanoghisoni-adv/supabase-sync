import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useActionData, useSubmit, useNavigation } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Modal,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import {
  getReadProxyTokenForDisplay,
  issueReadProxyToken,
} from '~/lib/read-proxy/token.server';
import { AccountCard } from '~/components/Dashboard/AccountCard';
import { DatabaseCard } from '~/components/Dashboard/DatabaseCard';
import { firstPlanWithCustomersSync } from '~/components/Dashboard/account-format';
import { samePlanName } from '~/lib/billing/plan-name';
import { syncIsActive } from '~/lib/sync/sync-active';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { supabaseConfig: true },
  });

  // Tutti i piani: da qui esce sia quello in uso (i clienti sono inclusi?) sia
  // quello da proporre a chi non li ha.
  const plans = await prisma.plan.findMany();
  const plan = plans.find((p) => samePlanName(p.planName, shop?.currentPlan)) ?? null;

  const connected = !!shop?.supabaseConfig?.connectionVerifiedAt;
  // La sincronizzazione e' automatica e sempre attiva: non c'e' niente da
  // accendere. Restano le due condizioni che non dipendono dal merchant — il
  // progetto collegato e il negozio autorizzato (a trial scaduto e' tutto
  // sospeso).
  const syncRunning = syncIsActive(shop?.supabaseConfig) && shop?.authorization === 'ENABLED';
  const customersIncluded = plan?.customersSyncEnabled ?? false;

  // Informazioni di account: sempre presenti, anche senza collegamento — proprio
  // in quel caso "Stato: Non collegato" e' l'informazione piu' utile.
  const account = {
    connected,
    planName: shop?.currentPlan ?? '',
    productsSyncActive: syncRunning,
    customersSyncActive: syncRunning && customersIncluded,
    // Il piano da proporre si calcola solo quando serve davvero.
    customersUpgradePlan: customersIncluded
      ? null
      : firstPlanWithCustomersSync(
          plans.map((p) => ({
            planName: p.planName,
            priceMonthly: Number(p.priceMonthly),
            customersSyncEnabled: p.customersSyncEnabled,
          })),
          shop?.currentPlan ?? null,
        ),
  };

  const config = shop?.supabaseConfig;
  if (!config) {
    return json({ account, config: null });
  }

  // Le letture di tracciamento non passano più dalla anon key del merchant ma
  // dal proxy dell'owner, che applica il gate sullo stato del negozio. Quindi
  // qui mostriamo URL del proxy + token, non la anon key. La service_role NON
  // viene mai restituita al client (troppo sensibile).
  const readToken = getReadProxyTokenForDisplay({
    readProxyTokenEnc: shop?.readProxyTokenEnc ?? null,
  });
  const proxyBaseUrl = process.env.SHOPIFY_APP_URL ?? '';

  return json({
    account,
    config: {
      readToken,
      proxyBaseUrl,
      syncIntervalHours: config.syncIntervalHours,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { supabaseConfig: true },
  });

  if (!shop?.supabaseConfig) {
    return json(
      { error: 'Nessun progetto Supabase collegato. Collega Supabase dalla Dashboard.' },
      { status: 400 },
    );
  }

  const formData = await request.formData();

  // Rigenerare la chiave di lettura e' l'unica cosa che questa pagina scrive:
  // la sincronizzazione e' automatica e non ha impostazioni, e le chiavi del
  // progetto restano quelle salvate durante il collegamento.
  if (formData.get('intent') === 'regenerate-read-token') {
    await issueReadProxyToken(shop.id);
    return json({
      success:
        'Chiave di lettura rigenerata. Aggiorna la configurazione nel tuo tool di tracciamento: la chiave precedente smetterà di funzionare entro ~30 secondi.',
    });
  }

  return json({ error: 'Richiesta non riconosciuta.' }, { status: 400 });
}

export default function SupabaseSettings() {
  const { account, config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const successMessage =
    actionData && 'success' in actionData ? actionData.success : undefined;
  const errorMessage =
    actionData && 'error' in actionData ? actionData.error : undefined;

  const [showRegenerate, setShowRegenerate] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();
  const regenerating =
    navigation.state !== 'idle' &&
    navigation.formData?.get('intent') === 'regenerate-read-token';

  const regenerate = () => {
    submit({ intent: 'regenerate-read-token' }, { method: 'post' });
    setShowRegenerate(false);
  };

  return (
    <Page title="Impostazioni Supabase" backAction={{ url: '/' }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {successMessage && <Banner tone="success">{successMessage}</Banner>}
            {errorMessage && <Banner tone="critical">{errorMessage}</Banner>}

            {/* Account e Database affiancati: sono due letture dello stesso
                colpo d'occhio (cosa prevede il piano, cosa risponde il progetto).
                A Database va la parte larga: indirizzo e chiave sono lunghi e
                nella colonna stretta finirebbero accorciati. */}
            {/* 35/65. minmax(0, …) e non i soli fr: senza, un valore lungo
                allargherebbe la colonna oltre la sua quota invece di stare
                dentro. */}
            <InlineGrid
              columns={{ xs: 1, md: 'minmax(0, 35fr) minmax(0, 65fr)' }}
              gap="400"
            >
              <AccountCard
                planName={account.planName}
                productsSyncActive={account.productsSyncActive}
                customersSyncActive={account.customersSyncActive}
                customersUpgradePlan={account.customersUpgradePlan}
              />
              <DatabaseCard
                connected={account.connected}
                appUrl={config?.proxyBaseUrl || null}
                readKey={config?.readToken ?? null}
              />
            </InlineGrid>

            {!config ? (
              <Banner tone="info">
                Nessun progetto Supabase collegato. Vai nella Dashboard per collegare
                Supabase.
              </Banner>
            ) : (
              <>
                {!config.readToken && (
                  <Banner tone="warning">
                    Chiave di lettura non ancora generata. Usa &laquo;Rigenera
                    chiave di lettura&raquo; per crearne una.
                  </Banner>
                )}
                {!config.proxyBaseUrl && (
                  <Banner tone="critical">
                    Indirizzo di lettura non disponibile: manca la configurazione
                    del dominio dell&apos;app. Contatta il supporto prima di
                    impostare il tracciamento.
                  </Banner>
                )}

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Chiave di lettura
                    </Text>
                    <Text as="p" tone="subdued">
                      Rigenerandola, la chiave attuale smette di funzionare: va
                      sostituita nel tuo tool di tracciamento.
                    </Text>
                    <InlineStack align="start">
                      <Button
                        tone="critical"
                        loading={regenerating}
                        onClick={() => setShowRegenerate(true)}
                      >
                        Rigenera chiave di lettura
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>

                <Modal
                  open={showRegenerate}
                  onClose={() => setShowRegenerate(false)}
                  title="Rigenerare la chiave di lettura?"
                  primaryAction={{
                    content: 'Rigenera',
                    destructive: true,
                    onAction: regenerate,
                    loading: regenerating,
                  }}
                  secondaryActions={[
                    {
                      content: 'Annulla',
                      onAction: () => setShowRegenerate(false),
                      disabled: regenerating,
                    },
                  ]}
                >
                  <Modal.Section>
                    {/* "entro ~30 secondi" e non "subito": il proxy tiene in
                        cache lo stato per token con TTL 30s, quindi la chiave
                        vecchia può restare valida fino allo scadere. */}
                    <Text as="p">
                      La chiave attuale smetterà di funzionare{' '}
                      <strong>entro ~30 secondi</strong>. Il tracciamento resterà
                      senza dati finché non incolli la nuova chiave nel tuo tool di
                      tracciamento.
                    </Text>
                  </Modal.Section>
                </Modal>
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
      {/* Respiro in fondo: senza, il bordo della card tocca il fondo dell'iframe. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
