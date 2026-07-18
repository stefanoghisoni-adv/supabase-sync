import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useRevalidator, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
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
  Tooltip,
  Banner,
  SkeletonDisplayText,
} from '@shopify/polaris';
import { ProductIcon, PersonIcon, SettingsIcon } from '@shopify/polaris-icons';
import { StatsCard } from '~/components/Dashboard/StatsCard';
import { ActivityLog } from '~/components/Dashboard/ActivityLog';
import { PlanBanner } from '~/components/Dashboard/PlanBanner';
import { Stepper, type StepperItem } from '~/components/Dashboard/Stepper';
import { resolveStepStates } from '~/components/Dashboard/stepper-state';
import { SupabaseConnect } from '~/components/Dashboard/SupabaseConnect';
import { prisma } from '~/db.server';
import { getOrCreateShop } from '~/utils/shop.server';
import { normalizeAuthorization, isAuthorized } from '~/utils/authorization.server';
import { resolveSyncState } from '~/components/Dashboard/sync-state';
import { enqueueManualSync, triggerSyncDrain } from '~/lib/queue/trigger.server';
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

    // Stato della sync iniziale/manuale, legato alla connessione CORRENTE
    // (job avviati dopo connectionVerifiedAt): così una riconnessione — anche a
    // un progetto diverso o vuoto — riabilita il pulsante e non eredita lo stato
    // "completato" della connessione precedente. Guida lo stato del pulsante.
    const syncState = resolveSyncState(
      recentJobs,
      shop.supabaseConfig?.connectionVerifiedAt,
    );

    return json({
      shop,
      plan,
      recentJobs,
      supabaseConnected,
      customersEnabled,
      syncState,
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

    // Sync in background durabile: mettiamo il job in coda (sopravvive a browser
    // chiuso / timeout) e inneschiamo SUBITO il drain in un'invocazione separata,
    // così la prima sync parte immediatamente senza attendere il cron. Se il
    // trigger fallisce, il cron ogni 30 min drena comunque la coda. Le sync
    // periodiche restano gestite dal cron secondo l'intervallo in Impostazioni.
    await enqueueManualSync(shop.id);
    triggerSyncDrain();

    return json({ queued: true });
  } catch (err) {
    // Non far crashare la pagina con "Unexpected Server Error": errore gestito.
    console.error('[dashboard action] sync fallita:', err instanceof Error ? err.message : 'errore sconosciuto');
    return json(
      { error: 'Avvio sincronizzazione non riuscito. Verifica il collegamento a Supabase e riprova.' },
      { status: 502 },
    );
  }
}

interface CountsResponse {
  totalProducts: number;
  customersEnabled: boolean;
  customerCount: number | null;
}

interface ReadinessResponse {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
  // true se il risultato arriva dalla cache: il client innesca poi il refresh live.
  cached?: boolean;
}

export default function Dashboard() {
  const { shop, plan, supabaseConnected, customersEnabled, authorization, syncState, recentJobs } =
    useLoaderData<typeof loader>();
  const blocked = authorization !== 'ENABLED';
  const navigate = useNavigate();

  // Stato del collegamento Supabase per il badge del primo step: Non collegato
  // (grigio) → In corso (arancione) → Fallito (rosso) / Collegato (verde).
  const [connectStatus, setConnectStatus] = useState<'idle' | 'in_progress' | 'failed'>('idle');
  const connectBadge = supabaseConnected
    ? { tone: 'success' as const, label: 'Collegato' }
    : connectStatus === 'failed'
      ? { tone: 'critical' as const, label: 'Fallito' }
      : connectStatus === 'in_progress'
        ? { tone: 'warning' as const, label: 'In corso' }
        : { tone: undefined, label: 'Non collegato' };

  // Due fetcher separati: i conteggi (totale prodotti/clienti) sono chiamate
  // "count" istantanee e alimentano subito PlanBanner, card totali e anteprima;
  // la readiness (pronti/problemi) richiede la paginazione completa e riempie solo
  // le sue due card in un secondo momento, senza bloccare il resto.
  const countsFetcher = useFetcher<CountsResponse>();
  const readinessFetcher = useFetcher<ReadinessResponse>();
  const readinessRefreshFetcher = useFetcher<ReadinessResponse>();

  useEffect(() => {
    countsFetcher.load('/api/stats/counts');
    readinessFetcher.load('/api/stats/products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se il primo risultato arriva dalla cache, ricalcola live in background:
  // la card resta piena con i numeri cache e si aggiorna quando il fresco è pronto.
  useEffect(() => {
    if (readinessFetcher.data?.cached) {
      readinessRefreshFetcher.load('/api/stats/products?refresh=1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readinessFetcher.data]);

  const counts = countsFetcher.data;
  // Il valore live (refresh) vince appena disponibile, altrimenti la cache/primo calcolo.
  const readiness = readinessRefreshFetcher.data ?? readinessFetcher.data;
  const countsLoading = countsFetcher.state === 'loading' || !counts;
  const readinessLoading = !readiness;

  // Sync in background durabile (coda + drain). Il pulsante mostra il loader
  // mentre la sync è in corso — anche se prosegue in background a pagina chiusa —
  // e resta disabilitato dopo il completamento (le successive sono automatiche).
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<{ queued?: boolean; error?: string }>();
  const [justQueued, setJustQueued] = useState(false);

  // Appena il job è in coda: mostra subito "in corso" e avvia il polling finché
  // il loader non riflette lo stato running/completed dal DB.
  useEffect(() => {
    if (syncFetcher.data?.queued) {
      setJustQueued(true);
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data]);

  const syncCompleted = syncState === 'completed';
  const submitting = syncFetcher.state !== 'idle';
  const inProgress =
    submitting || syncState === 'in_progress' || (justQueued && !syncCompleted);

  // Polling mentre la sync è in corso: rileva il passaggio a "completed".
  useEffect(() => {
    if (!inProgress || syncCompleted) return;
    const id = setInterval(() => revalidator.revalidate(), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgress, syncCompleted]);

  const syncDisabled = blocked || inProgress || syncCompleted;

  const steps = resolveStepStates(supabaseConnected);
  const syncTitle = customersEnabled
    ? 'Sincronizza prodotti e clienti'
    : 'Sincronizza prodotti';

  // Skeleton per i numeri di anteprima finché i conteggi non sono pronti.
  const numberSkeleton = (
    <Box minWidth="44px">
      <SkeletonDisplayText size="small" />
    </Box>
  );
  const previewProducts = countsLoading ? (
    numberSkeleton
  ) : (
    <Text as="span" variant="headingMd">
      {counts?.totalProducts ?? 0}
    </Text>
  );
  const previewCustomers = countsLoading ? (
    numberSkeleton
  ) : (
    <Text as="span" variant="headingMd">
      {counts?.customerCount ?? 0}
    </Text>
  );

  const stepperItems: StepperItem[] = [
    {
      id: 'connect-supabase',
      title: 'Collega Supabase',
      state: steps.connectSupabase,
      completeLabel: 'Collegato',
      badge: connectBadge,
      content: (
        // key sullo stato di connessione: rimonta il componente quando ci si
        // collega/scollega, azzerando lo state locale (evita il modal disconnetti
        // che riappare da solo e il flow rimasto "sporco" dopo un disconnect).
        <SupabaseConnect
          key={supabaseConnected ? 'connected' : 'disconnected'}
          connected={supabaseConnected}
          projectName={shop.supabaseConfig?.supabaseProjectRef ?? undefined}
          projectUrl={shop.supabaseConfig?.supabaseUrl ?? undefined}
          disabled={blocked}
          authorization={authorization}
          onConnectStatusChange={setConnectStatus}
        />
      ),
    },
    {
      id: 'sync',
      title: syncTitle,
      state: steps.sync,
      // A sync completata: nessun badge sullo step (né "In corso" né altro).
      hideBadge: syncCompleted,
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
                  {previewProducts}
                </InlineStack>
                {customersEnabled && (
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={PersonIcon} tone="subdued" />
                      <Text as="span">
                        Clienti → tabella <code>customers</code>
                      </Text>
                    </InlineStack>
                    {previewCustomers}
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
                loading={inProgress}
              >
                {syncCompleted
                  ? 'Sincronizzazione completata'
                  : inProgress
                    ? 'Sincronizzazione in corso…'
                    : 'Avvia sincronizzazione'}
              </Button>
              {syncCompleted ? (
                <Text as="span" tone="success">
                  Le sincronizzazioni successive avvengono in automatico.
                </Text>
              ) : inProgress ? (
                <Text as="span" tone="subdued">
                  Prosegue in background: puoi chiudere questa pagina.
                </Text>
              ) : null}
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
    <Page
      title="Dashboard"
      secondaryActions={[
        {
          content: 'Impostazioni',
          icon: SettingsIcon,
          url: '/settings/supabase',
          accessibilityLabel: 'Impostazioni',
        },
      ]}
    >
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
              products: counts?.totalProducts ?? 0,
              customers: counts?.customerCount ?? 0,
              customFields: 0,
            }}
          />
        )}

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <StatsCard
            title="Prodotti totali"
            value={counts?.totalProducts ?? 0}
            loading={countsLoading}
          />
          <StatsCard
            title="Prodotti pronti"
            value={readiness?.readyCount ?? 0}
            status="success"
            loading={readinessLoading}
          />
          <StatsCard
            title="Prodotti con problemi"
            value={readiness?.problemCount ?? 0}
            status="critical"
            loading={readinessLoading}
            info="Prodotti in cui manca il valore per cost_per_item."
            footer={
              <Box paddingBlockStart="100">
                <Button
                  variant="plain"
                  onClick={() => navigate('/products/issues')}
                >
                  Vedi dettagli
                </Button>
              </Box>
            }
          />
          {/* Card Clienti sempre presente: se il piano non include i clienti,
              al posto del numero mostra il pulsante di upgrade. */}
          {customersEnabled ? (
            <StatsCard
              title="Clienti"
              value={counts?.customerCount ?? 0}
              loading={countsLoading}
            />
          ) : (
            <StatsCard
              title="Clienti"
              value=""
              action={
                <Box paddingBlockStart="200">
                  <Tooltip content="Presto disponibile">
                    <Button variant="primary" disabled>
                      Aggiorna piano
                    </Button>
                  </Tooltip>
                </Box>
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
