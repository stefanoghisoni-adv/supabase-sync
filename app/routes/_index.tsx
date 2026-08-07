import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useRevalidator } from '@remix-run/react';
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
  Tooltip,
} from '@shopify/polaris';
import { ProductIcon, PersonIcon, SettingsIcon, LockIcon } from '@shopify/polaris-icons';
import { ProductsCard } from '~/components/Dashboard/ProductsCard';
import { PlanLimitBanner } from '~/components/Dashboard/PlanLimitBanner';
import { CustomersCard } from '~/components/Dashboard/CustomersCard';
import { Stepper, type StepperItem } from '~/components/Dashboard/Stepper';
import { EligibilityChart } from '~/components/Dashboard/EligibilityChart';
import { resolveStepStates } from '~/components/Dashboard/stepper-state';
import { SupabaseAccountConnect } from '~/components/Dashboard/SupabaseAccountConnect';
import { SupabaseProjectConnect } from '~/components/Dashboard/SupabaseProjectConnect';
import { prisma } from '~/db.server';
import { getOrCreateShop } from '~/utils/shop.server';
import { normalizeAuthorization, isAuthorized } from '~/utils/authorization.server';
import { resolveSyncState } from '~/components/Dashboard/sync-state';
import { enqueueManualSync, triggerSyncDrain } from '~/lib/queue/trigger.server';
import { authenticate } from '~/shopify.server';
import {
  hasPlanChanged,
  planChangeBanner,
  shouldTriggerPlanCatchUp,
  syncCtaState,
} from '~/components/Dashboard/plan-upgrade';
import { firstPlanWithCustomersSync } from '~/components/Dashboard/account-format';
import { normalizePlanName, samePlanName } from '~/lib/billing/plan-name';
import { authorizationBanners } from '~/components/Dashboard/authorization-banners';
import { SchemaUpdateBanner } from '~/components/Dashboard/SchemaUpdateBanner';
import { TrackingConflicts } from '~/components/Dashboard/TrackingConflicts';
import { ProductOverflowBanner } from '~/components/Dashboard/ProductOverflowBanner';
import { suggestPlanForProducts } from '~/components/Dashboard/plan-suggestion';
import type { TrackingFinding } from '~/lib/tracking/detect';
import { needsSchemaUpdate } from '~/lib/supabase/merchant-migrations';
import { triggerMerchantSchemaUpdate } from '~/lib/supabase/apply-schema-update.server';
import {
  refreshShopProfile,
  triggerShopProfileRefresh,
} from '~/lib/shop/refresh-shop-profile.server';
import { useNavLoading } from '~/components/Dashboard/nav-loading';

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

    // Dati che vivono su Shopify e possono cambiare senza dirci nulla: il
    // dominio principale e il fuso orario.
    //
    // Al primo giro si aspetta: il fuso lo consuma subito la tab Logs, e senza
    // le date ricadrebbero su UTC. Dalle volte successive il controllo va in
    // sottofondo (ogni ora al massimo), cosi' l'apertura dell'app non paga una
    // chiamata a Shopify per un dato che cambia una volta ogni tanto.
    // Best effort in entrambi i casi: se Shopify non risponde, la dashboard si
    // carica comunque.
    if (!shop.ianaTimezone) {
      try {
        await refreshShopProfile(shop);
      } catch (err) {
        console.warn(
          '[dashboard loader] lettura dati negozio fallita:',
          err instanceof Error ? err.message : 'errore sconosciuto',
        );
      }
    } else {
      triggerShopProfileRefresh(shop);
    }

    // Piano e job recenti dipendono entrambi solo da `shop`: in parallelo, così
    // il loader costa due round-trip in profondità invece di tre. Su Vercel il
    // DB è remoto, quindi ogni round-trip risparmiato è latenza in meno sul TTFB
    // — che è ciò che domina l'LCP di questa pagina.
    const [plans, recentJobs, customersTableJob, oauthToken] = await Promise.all([
      // Tutti i piani, non solo quello in uso: quando i clienti restano fuori
      // serve anche sapere quale piano li rimetterebbe dentro, e leggerli tutti
      // costa come leggerne uno (la tabella e' di poche righe).
      prisma.plan.findMany(),
      prisma.syncJob.findMany({
        where: { shopId: shop.id },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      // La tabella dei clienti risulta gia' provveduta? Vale sia l'evento di
      // creazione sia una sincronizzazione che ci ha davvero scritto dentro (la
      // tabella poteva esistere gia' nel progetto, e in quel caso nessuno ha
      // registrato una creazione).
      prisma.syncJob.findFirst({
        where: {
          shopId: shop.id,
          OR: [
            { jobType: { in: ['table_create_customers', 'table_create_both'] } },
            { customersSynced: { gt: 0 } },
          ],
        },
        select: { id: true },
      }),
      // Accesso a Supabase gia' fatto? E' il primo dei tre passi, e vale anche
      // senza un database scelto: chi chiude l'app a meta' flusso lo ritrova
      // concluso. Del token non serve altro che l'esistenza.
      prisma.supabaseOAuthToken.findUnique({
        where: { shopId: shop.id },
        select: { id: true },
      }),
    ]);

    const plan = plans.find((p) => samePlanName(p.planName, shop.currentPlan)) ?? null;

    // Autorizzazione: se il trial (giorni definiti nel piano) è scaduto e il
    // negozio è ancora ENABLED, lo portiamo automaticamente in PENDING (persistente).
    let authorization = normalizeAuthorization(shop.authorization);
    let trackingAuthorization = normalizeAuthorization(shop.trackingAuthorization);
    if (authorization === 'ENABLED' && shop.isInTrial && plan?.trialDays) {
      const trialEnd = shop.installedAt.getTime() + plan.trialDays * 86_400_000;
      if (Date.now() > trialEnd) {
        authorization = 'PENDING';
        // Alla fine della prova si fermano entrambe: e' quello che il periodo di
        // prova concede. Restano comunque due interruttori distinti, e l'owner
        // puo' riaccendere il solo tracciamento senza riaprire l'app.
        trackingAuthorization = 'PENDING';
        await prisma.shop.update({
          where: { id: shop.id },
          data: { authorization: 'PENDING', trackingAuthorization: 'PENDING' },
        });
      }
    }

    const supabaseConnected = !!shop.supabaseConfig?.connectionVerifiedAt;
    // Tabelle del merchant indietro rispetto a cio' che l'app si aspetta: il
    // tentativo parte subito in sottofondo (senza attesa, cosi' la dashboard non
    // rallenta) e il banner resta finche' non e' andato a buon fine.
    const schemaUpdatePending =
      supabaseConnected && needsSchemaUpdate(shop.supabaseConfig?.schemaVersion);
    if (schemaUpdatePending) {
      triggerMerchantSchemaUpdate(shop.id);
    }
    const supabaseAccountConnected = oauthToken !== null;
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
    // I piani sono gia' tutti in memoria: nessuna seconda interrogazione.
    const previousPlan = planChanged && shop.lastSyncedPlan
      ? plans.find((p) => samePlanName(p.planName, shop.lastSyncedPlan)) ?? null
      : null;

    // Cambio di piano: l'allineamento non lo chiediamo al merchant, parte da solo.
    // Qui non si accoda nulla (la dashboard non deve toccare la coda): si innesca
    // il giro di sincronizzazione, che riconosce da se' il negozio da recuperare.
    // Best effort e senza attesa: se non parte, ci pensa il giro programmato.
    // Anche la sola tabella clienti mancante fa scattare il recupero: dopo un
    // upgrade il piano dell'ultima sync puo' gia' risultare allineato mentre la
    // tabella non e' ancora stata provveduta.
    const customersPending =
      supabaseConnected && customersEnabled && customersTableJob === null;

    if (
      shouldTriggerPlanCatchUp({
        planChanged: planChanged || customersPending,
        syncInProgress: syncState === 'in_progress',
        lastBulkStartedAt:
          recentJobs.find((job) => job.jobType === 'initial_bulk')?.startedAt ?? null,
      })
    ) {
      triggerSyncDrain();
    }

    // Il banner del cambio di piano si mostra finche' c'e' un cambio da
    // annunciare, non una volta sola nella vita del negozio: ogni passaggio di
    // piano ne ha uno suo da comunicare (clienti sbloccati, oppure sync clienti
    // sospesa). La chiusura vale per la sessione, con un minimo di due minuti
    // prima che compaia la X.
    return json({
      shop,
      plan,
      supabaseConnected,
      supabaseAccountConnected,
      customersEnabled,
      syncState,
      authorization,
      trackingAuthorization,
      schemaUpdatePending,
      planChanged,
      currentMaxProducts: plan?.maxProducts ?? null,
      previousMaxProducts: previousPlan?.maxProducts ?? null,
      // Serve a distinguere "clienti sbloccati adesso" da "clienti che c'erano
      // gia'": la sola presenza della tabella non lo dice, perche' resta li'
      // anche dopo un downgrade.
      previousCustomersEnabled: previousPlan?.customersSyncEnabled ?? null,
      // Piano che rimetterebbe i clienti nella sincronizzazione: serve al banner
      // del cambio di piano quando li ha appena persi.
      customersUpgradePlan: customersEnabled
        ? null
        : firstPlanWithCustomersSync(
            plans.map((p) => ({
              planName: p.planName,
              priceMonthly: Number(p.priceMonthly),
              customersSyncEnabled: p.customersSyncEnabled,
            })),
            shop.currentPlan,
          ),
      customersTableCreated: customersTableJob !== null,
      // Listino completo: serve al banner che propone il piano giusto a chi ha
      // piu' prodotti di quanti il suo ne sincronizzi. Sono poche righe e le
      // abbiamo gia' in memoria: passarle costa meno di una seconda richiesta.
      planOptions: plans.map((p) => ({
        planName: p.planName,
        priceMonthly: Number(p.priceMonthly),
        priceYearly: Number(p.priceYearly),
        maxProducts: p.maxProducts,
        maxCustomers: p.maxCustomers,
        customersSyncEnabled: p.customersSyncEnabled,
      })),
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
    // Il messaggio NON deve indicare una causa che non conosciamo. Qui si
    // finisce per qualunque intoppo nell'avvio, e mandare il merchant a
    // controllare il collegamento a Supabase — come diceva prima — gli fa
    // cercare un guasto dove non c'e', mentre quello vero e' dalla nostra parte
    // e lui non puo' farci niente.
    return json(
      {
        error:
          'Non siamo riusciti ad avviare la sincronizzazione. Riprova fra qualche minuto: se continua, scrivici e ce ne occupiamo noi.',
      },
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

interface ProductHistoryResponse {
  /** Un punto per giorno del mese corrente; count null = giorno non ancora arrivato. */
  points: { day: number; count: number | null }[];
  monthLabel: string;
  /** Primo giorno del mese mostrato, in ISO. */
  monthStart: string;
  planLimit: number | null;
}

export default function Dashboard() {
  const { shop, plan, supabaseConnected, supabaseAccountConnected, customersEnabled, authorization, syncState, planChanged, currentMaxProducts, previousMaxProducts, previousCustomersEnabled, customersTableCreated, customersUpgradePlan, trackingAuthorization, schemaUpdatePending, planOptions } =
    useLoaderData<typeof loader>();
  const blocked = authorization !== 'ENABLED';

  // Altre fonti di eventi gia' attive sul negozio. Si chiede una volta sola, a
  // pagina aperta: e' un controllo di configurazione, non un dato che cambia
  // mentre il merchant guarda.
  const conflictsFetcher = useFetcher<{ findings: TrackingFinding[] }>();
  useEffect(() => {
    if (conflictsFetcher.state === 'idle' && !conflictsFetcher.data) {
      conflictsFetcher.load('/api/tracking/conflicts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pulsanti-link (Impostazioni, Vedi logs): mentre Remix carica la rotta di
  // destinazione mostriamo lo spinner e disabilitiamo il pulsante, così un clic
  // su un DB remoto (Vercel) non sembra "morto". Solo pero' se e' stato quel
  // pulsante a far partire la navigazione: cambiando sezione dal menu laterale
  // dell'admin si accendevano lo stesso, senza che nessuno li avesse premuti.
  const settingsNav = useNavLoading('/settings/supabase');
  const logsNav = useNavLoading('/logs');

  // Stato del collegamento Supabase per il badge del primo step: Non collegato
  // (grigio) → In corso (arancione) → Fallito (rosso) / Collegato (verde).
  const [connectStatus, setConnectStatus] = useState<'idle' | 'in_progress' | 'failed'>('idle');
  // Esito dell'ultima disconnessione. Vive qui e non dentro SupabaseProjectConnect
  // perche' quel componente viene rimontato appena il collegamento cade: il
  // banner sparirebbe nello stesso istante in cui deve comparire.
  const [disconnectDone, setDisconnectDone] = useState<'delete' | 'keep' | null>(null);
  // Badge del primo passo. "Collegato" lo decide il server (l'accesso risulta
  // fatto); gli stati intermedi li conosce solo il componente, che li riporta.
  const connectBadge = supabaseAccountConnected || supabaseConnected
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
  const historyFetcher = useFetcher<ProductHistoryResponse>();

  useEffect(() => {
    countsFetcher.load('/api/stats/counts');
    readinessFetcher.load('/api/stats/products');
    customerStatsFetcher.load('/api/stats/customers');
    historyFetcher.load('/api/stats/product-history');
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

  // Allineamento automatico dopo un cambio di piano: si conclude fuori dalla
  // pagina, quindi si ricontrolla a intervalli piu' larghi finche' il piano
  // dell'ultima sync non torna allineato (allora planChanged diventa falso).
  // Il tetto di tentativi evita di continuare all'infinito se il recupero non
  // riesce: la dashboard resta comunque aggiornabile ricaricandola.
  const [catchUpTicks, setCatchUpTicks] = useState(0);
  // Anche la tabella clienti ancora mancante e' un allineamento in corso: si
  // ricontrolla finche' non risulta provveduta.
  const catchUpPending =
    planChanged || (supabaseConnected && customersEnabled && !customersTableCreated);
  useEffect(() => {
    if (!catchUpPending || catchUpTicks >= 20) return;
    const id = setTimeout(() => {
      setCatchUpTicks((n) => n + 1);
      revalidator.revalidate();
    }, 15000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catchUpPending, catchUpTicks]);

  // A sync completata il pulsante resta disabilitato: al cambio di piano
  // l'allineamento (clienti e/o prodotti oltre il vecchio tetto) parte da solo,
  // quindi non c'e' nulla da premere — si mostra solo che sta succedendo.
  const cta = syncCtaState({
    blocked,
    inProgress,
    completed: syncCompleted,
    planChanged,
  });

  // Prodotti TOTALI, idonei e non: il tetto del piano li taglia comunque, e un
  // prodotto oggi senza costo diventa idoneo appena il merchant lo compila.
  const totalProducts = (readiness?.readyCount ?? 0) + (readiness?.problemCount ?? 0);
  const currentPlanOption = planOptions.find((p) => samePlanName(p.planName, shop.currentPlan)) ?? null;
  const suggestedPlan =
    currentPlanOption && readiness
      ? suggestPlanForProducts(planOptions, shop.currentPlan, totalProducts)
      : null;

  const steps = resolveStepStates(supabaseAccountConnected, supabaseConnected);

  const planBanner = planChangeBanner({
    planChanged,
    currentMax: currentMaxProducts,
    previousMax: previousMaxProducts,
    customersEnabled,
    customersTableCreated,
    customersUpgradePlan,
    previousCustomersEnabled,
  });
  const hasPlanBanner = planBanner !== null;

  // Ciclo di vita del banner. Compare appena c'e' un cambio di piano da
  // annunciare e, una volta comparso, resta per tutta la sessione: il
  // sessionStorage lo tiene vivo navigando fra le tab (stessa iframe) e
  // soprattutto NON lo fa sparire quando l'allineamento automatico finisce e
  // planChanged torna falso — altrimenti il merchant potrebbe non leggerlo mai.
  // Ci muore insieme, cioe' alla chiusura dell'app.
  const BANNER_KEY = 'planChangeBanner';
  // Anche la chiusura va nel sessionStorage: Dashboard e Logs sono route diverse,
  // quindi cambiando tab il componente si smonta e uno useState si azzererebbe —
  // il banner riapparirebbe pur essendo stato chiuso.
  const DISMISSED_KEY = 'planChangeBannerDismissed';
  const FLOOR_MS = 120_000;

  // Sia il banner conservato sia la chiusura sono legati al piano a cui si
  // riferiscono. Senza, il primo banner della sessione resterebbe l'unico: chi
  // scende a un piano senza clienti e poi risale a uno che li include
  // continuerebbe a leggere "la sincronizzazione dei clienti si interrompe",
  // cioe' l'esatto contrario di quello che ha appena comprato. Per lo stesso
  // motivo la X chiusa una volta non deve zittire anche i cambi successivi.
  const bannerPlanId = normalizePlanName(shop.currentPlan);

  // Il contenuto viene congelato insieme all'istante di comparsa: dopo
  // l'allineamento il loader non conosce piu' il piano precedente, quindi il
  // messaggio va conservato com'era quando il cambio e' stato rilevato.
  const [banner, setBanner] = useState<
    { at: number; plan: string; value: NonNullable<typeof planBanner> } | null
  >(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY) === bannerPlanId) {
      setBannerDismissed(true);
      setBanner(null);
      return;
    }
    // Chiusura riferita a un piano precedente: non vale piu'.
    setBannerDismissed(false);

    const stored = sessionStorage.getItem(BANNER_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.plan === bannerPlanId) {
          setBanner(parsed);
          return;
        }
      } catch {
        // Contenuto illeggibile: si riparte da capo.
      }
      sessionStorage.removeItem(BANNER_KEY);
    }

    if (planBanner) {
      const fresh = { at: Date.now(), plan: bannerPlanId, value: planBanner };
      sessionStorage.setItem(BANNER_KEY, JSON.stringify(fresh));
      setBanner(fresh);
    } else {
      setBanner(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlanBanner, bannerPlanId]);

  const dismissBanner = () => {
    sessionStorage.setItem(DISMISSED_KEY, bannerPlanId);
    setBannerDismissed(true);
  };

  // Al superamento dei 2 minuti il banner diventa chiudibile: serve un re-render
  // al momento giusto, altrimenti la X comparirebbe solo alla prossima
  // interazione.
  useEffect(() => {
    if (banner === null) return;
    const remaining = FLOOR_MS - (Date.now() - banner.at);
    if (remaining <= 0) return;
    const id = setTimeout(() => forceTick((n) => n + 1), remaining);
    return () => clearTimeout(id);
  }, [banner]);

  const showPlanBanner = banner !== null && !bannerDismissed;
  const bannerClosable = banner !== null && Date.now() - banner.at >= FLOOR_MS;

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
  // Clienti opt-in, NON il totale: e' il numero che verra' davvero scritto su
  // Supabase, ora che la sync filtra i non consenzienti. Stesso criterio gia'
  // applicato ai prodotti, dove il recap mostra le varianti idonee.
  const previewCustomers = customerStatsLoading ? (
    numberSkeleton
  ) : (
    <Text as="span" variant="headingMd">
      {customerStats?.optIn ?? 0}
    </Text>
  );

  const stepperItems: StepperItem[] = [
    {
      id: 'connect-supabase',
      title: 'Collega Supabase',
      state: steps.connectAccount,
      completeLabel: 'Collegato',
      badge: connectBadge,
      content: (
        // key sullo stato: rimonta il componente quando ci si collega o si
        // scollega, azzerando lo state locale (errori del tentativo precedente).
        <SupabaseAccountConnect
          key={supabaseAccountConnected ? 'connected' : 'disconnected'}
          connected={supabaseAccountConnected}
          disabled={blocked}
          onStatusChange={setConnectStatus}
        />
      ),
    },
    {
      id: 'connect-database',
      title: 'Crea o collega un database',
      state: steps.connectDatabase,
      completeLabel: 'Collegato',
      lockedHint: 'Accedi a Supabase per scegliere il database da collegare.',
      content: (
        <SupabaseProjectConnect
          key={supabaseConnected ? 'connected' : 'disconnected'}
          connected={supabaseConnected}
          projectName={shop.supabaseConfig?.supabaseProjectRef ?? undefined}
          projectUrl={shop.supabaseConfig?.supabaseUrl ?? undefined}
          disabled={blocked}
          authorization={authorization}
          onDisconnected={setDisconnectDone}
        />
      ),
    },
    {
      id: 'sync',
      // Cosa entra nella sincronizzazione lo dice il riquadro qui sotto, riga
      // per riga: ripeterlo nel titolo lo allungava senza aggiungere nulla.
      title: 'Sincronizzazione',
      state: steps.sync,
      // A sync completata: nessun badge sullo step (né "In corso" né altro).
      hideBadge: syncCompleted,
      lockedHint:
        'Collega un database per sbloccare la sincronizzazione.',
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
                {/* La riga Clienti c'e' sempre: se il piano non li include, al
                    posto del numero mostriamo un lucchetto, cosi' si capisce che
                    e' una funzione da sbloccare e non un dato fermo a zero. */}
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={PersonIcon} tone="subdued" />
                    <Text as="span" tone={customersEnabled ? undefined : 'subdued'}>
                      Clienti
                    </Text>
                  </InlineStack>
                  {customersEnabled ? (
                    previewCustomers
                  ) : (
                    <Tooltip content="Aggiorna ora per integrare la sincronizzazione dei clienti">
                      {/* Il glifo del lucchetto e' disegnato dentro un viewBox 20
                          con ~4px vuoti a destra: senza questo recupero l'icona
                          sembra rientrata rispetto al numero della riga sopra. */}
                      <span style={{ display: 'block', marginInlineEnd: '-4px' }}>
                        <Icon source={LockIcon} tone="subdued" />
                      </span>
                    </Tooltip>
                  )}
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Box>

          <syncFetcher.Form method="post">
            <InlineStack gap="300" blockAlign="center">
              <Button
                submit
                variant="primary"
                disabled={cta.disabled}
                loading={cta.loading}
              >
                {cta.label}
              </Button>
              {syncCompleted ? (
                <>
                  {/* url + Remix Link: il clic arma logsNav, che disabilita il
                      pulsante e mostra lo spinner fino all'arrivo su /logs. */}
                  <Button
                    url="/logs"
                    onClick={logsNav.start}
                    disabled={logsNav.loading}
                    loading={logsNav.loading}
                  >
                    Vedi logs
                  </Button>
                  {planChanged ? (
                    <Text as="span" tone="subdued">
                      Stiamo allineando i dati al nuovo piano: non devi fare nulla.
                    </Text>
                  ) : (
                    <Text as="span" tone="success">
                      Le sincronizzazioni successive avvengono in automatico.
                    </Text>
                  )}
                </>
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
          onAction: settingsNav.start,
          disabled: settingsNav.loading,
          loading: settingsNav.loading,
        },
      ]}
    >
      {/* gap ridotto: gli avvisi sono una pila e vanno letti come tale.
          Distanziati come sezioni sembravano problemi separati, e la pagina
          cominciava con mezzo schermo di aria. Lo stacco vero resta uno solo,
          prima del contenuto. */}
      <BlockStack gap="300">
        {/* Esito della disconnessione: in cima perche' e' la risposta all'ultima
            azione del merchant, e il modal che l'ha avviata e' gia' sparito. */}
        {disconnectDone && (
          <Banner
            tone="success"
            title={
              disconnectDone === 'delete'
                ? 'Tabelle e dati eliminati'
                : 'Collegamento rimosso'
            }
            onDismiss={() => setDisconnectDone(null)}
          >
            <Text as="p">
              {disconnectDone === 'delete'
                ? 'Il collegamento è stato rimosso e le tabelle create dall’app, con i dati sincronizzati, sono state eliminate dal progetto.'
                : 'Il collegamento è stato rimosso. Le tabelle e i dati sincronizzati restano nel progetto: ricollegandolo, la sincronizzazione riparte da lì.'}
            </Text>
          </Banner>
        )}

        {/* Banner di sospensione (non chiudibili). Uso dell'app e tracciamento
            sono due autorizzazioni indipendenti: puo' esserci l'una senza
            l'altra, e il banner lo dice invece di dare tutto per spento. */}
        {authorizationBanners(authorization, trackingAuthorization).map((b) => (
          <Banner key={b.id} tone={b.tone} title={b.title}>
            <Text as="p">{b.message}</Text>
          </Banner>
        ))}

        {/* Chi altro sta gia' inviando eventi. Non compare se non c'e' niente
            da segnalare. */}
        <TrackingConflicts findings={conflictsFetcher.data?.findings ?? []} />

        {/* Tabelle da allineare: non si chiude finche' l'aggiornamento non e'
            andato a buon fine. Di norma succede da solo e il banner nemmeno si
            vede. */}
        {schemaUpdatePending && <SchemaUpdateBanner />}

        {/* Catalogo piu' grande del tetto: dice quanti restano fuori e propone
            il piano che li contiene tutti. */}
        {currentPlanOption && (
          <ProductOverflowBanner
            totalProducts={totalProducts}
            currentPlan={currentPlanOption}
            suggestedPlan={suggestedPlan}
            disabled={blocked}
          />
        )}

        {/* Quota prodotti agli sgoccioli: non si chiude, perche' resta vero
            finche' il piano non cambia. Tace quando il banner qui sopra e' gia'
            visibile: direbbero la stessa cosa, e quello sopra porta anche la
            soluzione. */}
        {!suggestedPlan && (
        <PlanLimitBanner
          count={readiness?.readyCount ?? 0}
          limit={currentMaxProducts}
        />
        )}

        {showPlanBanner && banner && (
          <Banner
            tone={banner.value.tone}
            title={banner.value.title}
            onDismiss={bannerClosable ? dismissBanner : undefined}
          >
            {/* Un paragrafo per argomento: prodotti e clienti cambiano per
                motivi diversi e vanno letti separatamente. */}
            <BlockStack gap="200">
              {banner.value.messages.map((message, index) => (
                <Text as="p" key={index}>
                  {typeof message === 'string'
                    ? message
                    : // Paragrafo a pezzi: il grassetto sta dentro la frase (il
                      // nuovo tetto prodotti), non su una riga a parte.
                      message.map((segment, segmentIndex) =>
                        segment.bold ? (
                          <Text key={segmentIndex} as="span" fontWeight="bold">
                            {segment.text}
                          </Text>
                        ) : (
                          segment.text
                        ),
                      )}
                </Text>
              ))}
            </BlockStack>
          </Banner>
        )}

        {/* Qui finiscono gli avvisi e comincia il contenuto: e' l'unico punto in
            cui serve respiro, ed e' quello che rende leggibile la pila sopra. */}
        <Box paddingBlockStart="300" />

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <ProductsCard
            readyCount={readiness?.readyCount ?? 0}
            problemCount={readiness?.problemCount ?? 0}
            planLimit={currentMaxProducts}
            loading={readinessLoading}
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
          <EligibilityChart
            points={historyFetcher.data?.points ?? []}
            monthLabel={historyFetcher.data?.monthLabel}
            monthStart={historyFetcher.data?.monthStart}
            planLimit={historyFetcher.data?.planLimit ?? null}
            loading={!historyFetcher.data}
          />
        </InlineGrid>

        {/* Respiro in fondo: senza, il bordo dell'ultima card tocca il fondo dell'iframe. */}
        <Box paddingBlockEnd="800" />
      </BlockStack>
    </Page>
  );
}
