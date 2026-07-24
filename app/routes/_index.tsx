import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useRevalidator, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  Page,
  Box,
  BlockStack,
  InlineGrid,
  InlineStack,
  Button,
  Text,
  Icon,
  Banner,
  SkeletonDisplayText,
} from '@shopify/polaris';
import { ProductIcon, PersonIcon, SettingsIcon } from '@shopify/polaris-icons';
import { ProductsCard } from '~/components/Dashboard/ProductsCard';
import { CustomersCard } from '~/components/Dashboard/CustomersCard';
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
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { hasPlanChanged, syncButtonLabel, planChangeBanner } from '~/components/Dashboard/plan-upgrade';

// Solo per questo store mostriamo il messaggio d'errore reale (utile in debug),
// invece del generico "Errore interno": gli altri merchant non devono vedere
// dettagli tecnici. In produzione Remix maschererebbe altrimenti tutto.
const DEBUG_SHOP_DOMAIN = 'test-negozio-11.myshopify.com';

export async function loader({ request }: LoaderFunctionArgs) {
  let sessionShop: string | undefined;
  try {
    const { session } = await authenticate.admin(request);
    sessionShop = session.shop;

    // Self-heal: crea il record shop se manca (reinstall, cancellazione manuale,
    // race durante l'embedded auth) invece di mandare l'app in 404.
    const shop = await getOrCreateShop(session);

    // Il fuso del negozio si legge una volta sola e resta memorizzato: lo consuma
    // la tab Logs, che lo trova gia' pronto sullo shop. Best effort — se Shopify
    // non risponde le date ricadranno su UTC e la dashboard si carica comunque.
    if (!shop.ianaTimezone) {
      try {
        const info = await new ShopifyAPIClient(shop.shopDomain, shop.accessToken).getShopInfo();
        if (info.ianaTimezone) {
          await prisma.shop.update({
            where: { id: shop.id },
            data: { ianaTimezone: info.ianaTimezone },
          });
        }
      } catch (err) {
        console.warn(
          '[dashboard loader] lettura fuso orario negozio fallita:',
          err instanceof Error ? err.message : 'errore sconosciuto',
        );
      }
    }

    // Piano e job recenti dipendono entrambi solo da `shop`: in parallelo, così
    // il loader costa due round-trip in profondità invece di tre. Su Vercel il
    // DB è remoto, quindi ogni round-trip risparmiato è latenza in meno sul TTFB
    // — che è ciò che domina l'LCP di questa pagina.
    const [plan, recentJobs] = await Promise.all([
      prisma.plan.findUnique({
        where: { planName: shop.currentPlan },
      }),
      prisma.syncJob.findMany({
        where: { shopId: shop.id },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

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

    // Piano dell'ultima sync: serve a capire se c'e' altro da sincronizzare e a
    // dire, nel banner, se il tetto prodotti e' salito o sceso.
    const planChanged = hasPlanChanged(shop.currentPlan, shop.lastSyncedPlan);
    const previousPlan = planChanged && shop.lastSyncedPlan
      ? await prisma.plan.findUnique({ where: { planName: shop.lastSyncedPlan } })
      : null;

    // Il banner si mostra una volta sola nella vita del negozio: lo si marca qui,
    // al primo render che lo mostrerebbe, cosi' alla riapertura dell'app non
    // torna. Dentro la sessione resta vivo grazie al sessionStorage lato client.
    const bannerFirstShow = planChanged && shop.planBannerShownAt == null;
    if (bannerFirstShow) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { planBannerShownAt: new Date() },
      });
    }

    return json({
      shop,
      plan,
      supabaseConnected,
      customersEnabled,
      syncState,
      authorization,
      planChanged,
      currentMaxProducts: plan?.maxProducts ?? null,
      previousMaxProducts: previousPlan?.maxProducts ?? null,
      bannerFirstShow,
    });
  } catch (err) {
    // Le Response (redirect di auth, 404) devono passare intatte.
    if (err instanceof Response) throw err;
    // Il dettaglio completo va SOLO nei log del server: rilanciare il testo
    // grezzo al browser esporrebbe dettagli interni (info-disclosure). Eccezione:
    // il nostro store di test, per diagnosticare in produzione.
    console.error('[dashboard loader] errore non gestito:', err);
    const isDev = process.env.NODE_ENV !== 'production';
    const showDetail = isDev || sessionShop === DEBUG_SHOP_DOMAIN;
    const detail =
      showDetail && err instanceof Error
        ? `[debug] ${err.message}`
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
  // Totale varianti esposto dall'endpoint. La card lo ricalcola comunque come
  // readyCount + problemCount (vero per costruzione): qui il campo completa il
  // contratto dell'API, non e' la fonte usata per il rendering.
  totalVariants: number;
  readyCount: number;
  problemCount: number;
  // true se il risultato arriva dalla cache: il client innesca poi il refresh live.
  cached?: boolean;
}

interface CustomerStatsResponse {
  enabled: boolean;
  totalCustomers: number;
  optIn: number;
  optOut: number;
  cached?: boolean;
}

export default function Dashboard() {
  const { shop, plan, supabaseConnected, customersEnabled, authorization, syncState, planChanged, currentMaxProducts, previousMaxProducts, bannerFirstShow } =
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
  const customerStatsFetcher = useFetcher<CustomerStatsResponse>();
  const customerStatsRefreshFetcher = useFetcher<CustomerStatsResponse>();

  useEffect(() => {
    countsFetcher.load('/api/stats/counts');
    readinessFetcher.load('/api/stats/products');
    customerStatsFetcher.load('/api/stats/customers');
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

  useEffect(() => {
    if (customerStatsFetcher.data?.cached) {
      customerStatsRefreshFetcher.load('/api/stats/customers?refresh=1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerStatsFetcher.data]);

  const counts = countsFetcher.data;
  // Il valore live (refresh) vince appena disponibile, altrimenti la cache/primo calcolo.
  const readiness = readinessRefreshFetcher.data ?? readinessFetcher.data;
  const customerStats = customerStatsRefreshFetcher.data ?? customerStatsFetcher.data;
  const countsLoading = countsFetcher.state === 'loading' || !counts;
  const readinessLoading = !readiness;
  const customerStatsLoading = !customerStats;

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

  // A sync completata il pulsante resta disabilitato FINCHE' il piano non cambia:
  // al cambio c'e' altro da sincronizzare (clienti e/o prodotti oltre il vecchio
  // tetto), quindi torna disponibile. Dopo la nuova sync lastSyncedPlan si
  // riallinea e il pulsante si ridisabilita da solo.
  const syncDisabled = blocked || inProgress || (syncCompleted && !planChanged);

  const steps = resolveStepStates(supabaseConnected);
  const syncTitle = syncButtonLabel({ planChanged, customersEnabled });

  // Ciclo di vita del banner:
  // - sessionStorage lo tiene vivo navigando fra le tab (stessa iframe) e muore
  //   con la chiusura di app/Shopify, che e' esattamente il comportamento voluto;
  // - il flag persistente scritto dal loader impedisce che torni alla riapertura.
  // Nessuno dei due meccanismi da solo soddisfa entrambe le richieste.
  const BANNER_KEY = 'planChangeBannerShownAt';
  // Anche la chiusura va nel sessionStorage: Dashboard e Logs sono route diverse,
  // quindi cambiando tab il componente si smonta e uno useState si azzererebbe —
  // il banner riapparirebbe pur essendo stato chiuso. Cosi' invece la chiusura
  // sopravvive alla navigazione e muore con la sessione, come il banner stesso.
  const DISMISSED_KEY = 'planChangeBannerDismissed';
  const FLOOR_MS = 120_000;

  const [bannerAt, setBannerAt] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY)) {
      setBannerDismissed(true);
      return;
    }
    const stored = sessionStorage.getItem(BANNER_KEY);
    if (stored) {
      setBannerAt(Number(stored));
      return;
    }
    if (bannerFirstShow) {
      const now = Date.now();
      sessionStorage.setItem(BANNER_KEY, String(now));
      setBannerAt(now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissBanner = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setBannerDismissed(true);
  };

  // Al superamento dei 2 minuti il banner diventa chiudibile: serve un re-render
  // al momento giusto, altrimenti la X comparirebbe solo alla prossima
  // interazione.
  useEffect(() => {
    if (bannerAt === null) return;
    const remaining = FLOOR_MS - (Date.now() - bannerAt);
    if (remaining <= 0) return;
    const id = setTimeout(() => forceTick((n) => n + 1), remaining);
    return () => clearTimeout(id);
  }, [bannerAt]);

  const showPlanBanner = bannerAt !== null && !bannerDismissed;
  const bannerClosable = bannerAt !== null && Date.now() - bannerAt >= FLOOR_MS;
  const planBanner = planChangeBanner({
    currentMax: currentMaxProducts,
    previousMax: previousMaxProducts,
    customersEnabled,
  });

  // Skeleton per i numeri di anteprima finché i conteggi non sono pronti.
  const numberSkeleton = (
    <Box minWidth="44px">
      <SkeletonDisplayText size="small" />
    </Box>
  );
  // Varianti idonee, NON il totale a catalogo: e' il numero che verra' davvero
  // scritto su Supabase, coerente con la card Prodotti. Usare counts.totalProducts
  // qui mostrava una grandezza diversa su due assi (prodotti vs varianti, tutti
  // vs idonei), quindi non poteva coincidere con la card.
  const previewProducts = readinessLoading ? (
    numberSkeleton
  ) : (
    <Text as="span" variant="headingMd">
      {readiness?.readyCount ?? 0}
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
                    <Text as="span">Prodotti</Text>
                  </InlineStack>
                  {previewProducts}
                </InlineStack>
                {customersEnabled && (
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={PersonIcon} tone="subdued" />
                      <Text as="span">Clienti</Text>
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

        {showPlanBanner && (
          <Banner
            tone={planBanner.tone}
            title={planBanner.title}
            onDismiss={bannerClosable ? dismissBanner : undefined}
          >
            <Text as="p">{planBanner.message}</Text>
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

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <ProductsCard
            readyCount={readiness?.readyCount ?? 0}
            problemCount={readiness?.problemCount ?? 0}
            loading={readinessLoading}
            onViewIssues={() => navigate('/products/issues')}
          />
          <CustomersCard
            enabled={customersEnabled}
            totalCustomers={customerStats?.totalCustomers ?? 0}
            optIn={customerStats?.optIn ?? 0}
            optOut={customerStats?.optOut ?? 0}
            loading={customerStatsLoading}
          />
        </InlineGrid>

        {/* Lo Stepper resta a meta' larghezza a sinistra: il log e' passato alla
            tab dedicata "Logs". */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Stepper steps={stepperItems} />
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
