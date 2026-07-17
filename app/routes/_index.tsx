import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect } from 'react';
import {
  Page,
  Layout,
  Box,
  BlockStack,
  InlineGrid,
  InlineStack,
  Button,
  Text,
  Icon,
  Banner,
} from '@shopify/polaris';
import { ProductIcon, PersonIcon } from '@shopify/polaris-icons';
import { StatsCard } from '~/components/Dashboard/StatsCard';
import { ActivityLog } from '~/components/Dashboard/ActivityLog';
import { PlanBanner } from '~/components/Dashboard/PlanBanner';
import { Stepper, type StepperItem } from '~/components/Dashboard/Stepper';
import { resolveStepStates } from '~/components/Dashboard/stepper-state';
import { SupabaseConnect } from '~/components/Dashboard/SupabaseConnect';
import { prisma } from '~/db.server';
import { getOrCreateShop } from '~/utils/shop.server';
import { normalizeAuthorization, isAuthorized } from '~/utils/authorization.server';
import { processManualSync } from '~/lib/workers/processors.server';
import { authenticate } from '~/shopify.server';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);

    // Self-heal: crea il record shop se manca (reinstall, cancellazione manuale,
    // race durante l'embedded auth) invece di mandare l'app in 404.
    const shop = await getOrCreateShop(session);

    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });

    // Autorizzazione: se il trial (giorni definiti nel piano) è scaduto e il
    // negozio è ancora ENABLED, lo portiamo automaticamente in PENDING (persistente).
    let authorization = normalizeAuthorization(shop.authorization);
    if (authorization === 'ENABLED' && shop.isInTrial && plan?.trialDays) {
      const trialEnd = shop.installedAt.getTime() + plan.trialDays * 86_400_000;
      if (Date.now() > trialEnd) {
        authorization = 'PENDING';
        await prisma.shop.update({
          where: { id: shop.id },
          data: { authorization: 'PENDING' },
        });
      }
    }

    const recentJobs = await prisma.syncJob.findMany({
      where: { shopId: shop.id },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    const supabaseConnected = !!shop.supabaseConfig?.connectionVerifiedAt;
    const customersEnabled = plan?.customersSyncEnabled ?? false;

    return json({
      shop,
      plan,
      recentJobs,
      supabaseConnected,
      customersEnabled,
      authorization,
    });
  } catch (err) {
    // Le Response (redirect di auth, 404) devono passare intatte.
    if (err instanceof Response) throw err;
    // Il dettaglio completo va SOLO nei log del server: rilanciare il testo
    // grezzo al browser esporrebbe dettagli interni (info-disclosure).
    console.error('[dashboard loader] errore non gestito:', err);
    const isDev = process.env.NODE_ENV !== 'production';
    const detail =
      isDev && err instanceof Error
        ? err.message
        : "Errore interno del server. Controlla i log dell'app per il dettaglio.";
    throw new Response(detail, { status: 500, statusText: 'Errore dashboard' });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  try {
    const shop = await getOrCreateShop(session);

    // Gate autorizzazione: nessuna azione se il negozio non è ENABLED (ban o
    // trial scaduto). Enforcement server-side: vale anche se l'utente riabilita
    // i pulsanti nell'HTML.
    if (!isAuthorized(shop.authorization)) {
      return json(
        { error: "L'utilizzo dell'app è sospeso per questo negozio.", code: 'not_authorized' },
        { status: 403 },
      );
    }

    // Sincronizzazione manuale eseguita SUBITO, in modo sincrono: la prima
    // popolazione delle tabelle è immediata (niente attesa del cron). Le
    // sync automatiche periodiche restano gestite dal cron secondo l'intervallo
    // configurato in Impostazioni. Lo stub `job` copre updateProgress, usato
    // solo per il tracking di coda (qui non serve).
    const stubJob = {
      updateProgress: async () => {},
    } as unknown as Parameters<typeof processManualSync>[1];
    await processManualSync(shop.id, stubJob);

    return json({ ok: true });
  } catch (err) {
    // Non far crashare la pagina con "Unexpected Server Error": errore gestito.
    console.error('[dashboard action] sync fallita:', err instanceof Error ? err.message : 'errore sconosciuto');
    return json(
      { error: 'Sincronizzazione non riuscita. Verifica il collegamento a Supabase e riprova.' },
      { status: 502 },
    );
  }
}

interface StatsResponse {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
  customersEnabled: boolean;
  customerCount: number | null;
}

export default function Dashboard() {
  const { shop, plan, recentJobs, supabaseConnected, customersEnabled, authorization } =
    useLoaderData<typeof loader>();
  const blocked = authorization !== 'ENABLED';

  const statsFetcher = useFetcher<StatsResponse>();

  useEffect(() => {
    statsFetcher.load('/api/stats/products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = statsFetcher.data;
  const statsLoading = statsFetcher.state === 'loading' || !stats;

  // Sync manuale/iniziale eseguita via fetcher: mostra il loader interno al
  // pulsante durante l'esecuzione e resta disabilitato dopo il successo (le
  // sincronizzazioni successive sono automatiche via cron).
  const syncFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const syncing = syncFetcher.state !== 'idle';
  const hasCompletedSync =
    recentJobs.some((j) => j.jobType === 'initial_bulk' && j.status === 'completed') ||
    syncFetcher.data?.ok === true;
  const syncDisabled = blocked || syncing || hasCompletedSync;

  const steps = resolveStepStates(supabaseConnected);
  const syncTitle = customersEnabled
    ? 'Sincronizza prodotti e clienti'
    : 'Sincronizza prodotti';

  const previewProducts = stats?.totalProducts ?? '…';
  const previewCustomers = stats?.customerCount ?? '…';

  const stepperItems: StepperItem[] = [
    {
      id: 'connect-supabase',
      title: 'Collega Supabase',
      state: steps.connectSupabase,
      completeLabel: 'Collegato',
      content: (
        <SupabaseConnect
          connected={supabaseConnected}
          projectName={shop.supabaseConfig?.supabaseProjectRef ?? undefined}
          projectUrl={shop.supabaseConfig?.supabaseUrl ?? undefined}
          disabled={blocked}
        />
      ),
    },
    {
      id: 'sync',
      title: syncTitle,
      state: steps.sync,
      lockedHint:
        'Completa il collegamento a Supabase per sbloccare la sincronizzazione.',
      content: (
        <BlockStack gap="400">
          <Box background="bg-surface-secondary" borderRadius="200" padding="400">
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Cosa verrà sincronizzato
              </Text>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={ProductIcon} tone="subdued" />
                    <Text as="span">
                      Prodotti → tabella <code>products</code>
                    </Text>
                  </InlineStack>
                  <Text as="span" variant="headingMd">
                    {previewProducts}
                  </Text>
                </InlineStack>
                {customersEnabled && (
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={PersonIcon} tone="subdued" />
                      <Text as="span">
                        Clienti → tabella <code>customers</code>
                      </Text>
                    </InlineStack>
                    <Text as="span" variant="headingMd">
                      {previewCustomers}
                    </Text>
                  </InlineStack>
                )}
              </BlockStack>
            </BlockStack>
          </Box>

          <syncFetcher.Form method="post">
            <InlineStack gap="300" blockAlign="center">
              <Button
                submit
                variant="primary"
                disabled={syncDisabled}
                loading={syncing}
              >
                {hasCompletedSync
                  ? 'Sincronizzazione completata'
                  : 'Avvia sincronizzazione'}
              </Button>
              {hasCompletedSync && !syncing && (
                <Text as="span" tone="success">
                  Le sincronizzazioni successive avvengono in automatico.
                </Text>
              )}
            </InlineStack>
          </syncFetcher.Form>

          {syncFetcher.data?.error && (
            <Banner tone="critical">{syncFetcher.data.error}</Banner>
          )}
        </BlockStack>
      ),
    },
  ];

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Banner di blocco (non chiudibile): danger se DISABLED, warning se PENDING. */}
        {authorization === 'DISABLED' && (
          <Banner tone="critical" title="App disabilitata">
            <Text as="p">
              L'utilizzo dell'app è stato disabilitato per questo negozio. Tutte le funzioni e
              le sincronizzazioni sono sospese.
            </Text>
          </Banner>
        )}
        {authorization === 'PENDING' && (
          <Banner tone="warning" title="Periodo di prova terminato">
            <Text as="p">
              Il periodo di prova è terminato: il tracciamento che utilizza le tabelle Supabase
              è sospeso. Aggiorna il piano per riattivarlo.
            </Text>
          </Banner>
        )}

        {plan && (
          <PlanBanner
            shop={shop}
            plan={plan}
            currentUsage={{
              products: stats?.totalProducts ?? 0,
              customers: stats?.customerCount ?? 0,
              customFields: 0,
            }}
          />
        )}

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <StatsCard
            title="Prodotti totali"
            value={stats?.totalProducts ?? 0}
            loading={statsLoading}
          />
          <StatsCard
            title="Prodotti pronti"
            value={stats?.readyCount ?? 0}
            status="success"
            loading={statsLoading}
          />
          <StatsCard
            title="Prodotti con problemi"
            value={stats?.problemCount ?? 0}
            status="critical"
            loading={statsLoading}
          />
          {/* Card Clienti sempre presente: se il piano non include i clienti,
              al posto del numero mostra il pulsante di upgrade. */}
          {customersEnabled ? (
            <StatsCard
              title="Clienti"
              value={stats?.customerCount ?? 0}
              loading={statsLoading}
            />
          ) : (
            <StatsCard
              title="Clienti"
              value=""
              action={
                <Button url="/billing" variant="primary">
                  Aggiorna piano
                </Button>
              }
            />
          )}
        </InlineGrid>

        <Stepper steps={stepperItems} />

        {supabaseConnected && (
          <Layout>
            <Layout.Section>
              <ActivityLog jobs={recentJobs} />
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
