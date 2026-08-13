import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Page,
  Layout,
  Banner,
  BlockStack,
  InlineGrid,
  Box,
  Button,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getReadProxyTokenForDisplay } from '~/lib/read-proxy/token.server';
import { AccountCard } from '~/components/Dashboard/AccountCard';
import { DatabaseCard } from '~/components/Dashboard/DatabaseCard';
import { firstPlanWithCustomersSync } from '~/components/Dashboard/account-format';
import { samePlanName } from '~/lib/billing/plan-name';
import { syncIsActive } from '~/lib/sync/sync-active';
import { loadSyncTiming } from '~/lib/sync/sync-timing.server';
import { SyncCard } from '~/components/Dashboard/SyncCard';

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

  // Cadenza del piano e ultima corsa completata: la sincronizzazione e' una
  // delle cose che il merchant viene a controllare qui, e finora la pagina non
  // ne diceva niente. Le date le calcola loadSyncTiming, che le determina allo
  // stesso modo anche per la dashboard.
  const frequencyHours = plan?.maxSyncFrequencyHours ?? null;
  const timing = shop
    ? await loadSyncTiming(shop.id, frequencyHours)
    : { lastSync: null, nextSync: null };

  const sync = {
    frequencyHours,
    ...timing,
    timeZone: shop?.ianaTimezone ?? null,
  };

  const config = shop?.supabaseConfig;
  if (!config) {
    return json({ account, config: null, sync });
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
    sync,
    config: {
      readToken,
      proxyBaseUrl,
      // Indirizzo del progetto del merchant: e' suo, e da qui ci arriva con un
      // clic invece di ricordarselo.
      databaseUrl: config.supabaseUrl,
      syncIntervalHours: config.syncIntervalHours,
    },
  });
}

// Nessuna action: questa pagina non scrive niente. La sincronizzazione e'
// automatica e non ha impostazioni, la chiave di lettura viene emessa una volta
// al collegamento del progetto e le chiavi del progetto non si toccano da qui.
export default function SupabaseSettings() {
  const { account, config, sync } = useLoaderData<typeof loader>();

  return (
    <Page fullWidth title="Impostazioni" backAction={{ url: '/' }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Gli avvisi stanno in cima, prima delle card: dicono se quello
                che si sta per leggere ha senso — senza un progetto collegato,
                meta' dei valori sotto sono vuoti per forza. In fondo li si
                trovava dopo averli gia' cercati. */}
            {!config ? (
              <Banner tone="info">
                {/* "Dashboard" e' il posto dove si collega: tanto vale
                    portarcelo, invece di dirgli di cercarlo.

                    Button e non Link: Polaris rende monocromatici i Link dentro
                    un Banner (Link legge BannerContext e si spegne, senza una
                    prop per chiedere il contrario). Il Button variant="plain" e'
                    lo stesso comando di "Aggiorna a Pro", quindi il blu e' lo
                    stesso per costruzione e non per una regola copiata. */}
                Nessun progetto Supabase collegato. Vai alla{' '}
                <Button variant="plain" url="/">
                  Dashboard
                </Button>{' '}
                per collegare il tuo database.
              </Banner>
            ) : (
              <>
                {!config.readToken && (
                  <Banner tone="warning">
                    Chiave di lettura non disponibile: il tracciamento non riesce
                    a leggere i dati. Scrivici e la rimettiamo a posto.
                  </Banner>
                )}
                {!config.proxyBaseUrl && (
                  <Banner tone="critical">
                    Indirizzo di lettura non disponibile: manca la configurazione
                    del dominio dell&apos;app. Contatta il supporto prima di
                    impostare il tracciamento.
                  </Banner>
                )}
              </>
            )}

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
                databaseUrl={config?.databaseUrl ?? null}
              />
            </InlineGrid>

            <SyncCard
              frequencyHours={sync.frequencyHours}
              lastSync={sync.lastSync}
              nextSync={sync.nextSync}
              timeZone={sync.timeZone}
            />

          </BlockStack>
        </Layout.Section>
      </Layout>
      {/* Respiro in fondo: senza, il bordo della card tocca il fondo dell'iframe. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
