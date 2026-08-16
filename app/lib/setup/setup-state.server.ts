import { prisma } from '~/db.server';
import { resolveSyncState } from '~/components/Dashboard/sync-state';
import {
  allStepsComplete,
  resolveStepStates,
  type StepInput,
} from '~/components/Dashboard/stepper-state';

/**
 * A che punto e' la configurazione di un negozio, letto dal database.
 *
 * La dashboard lo sa gia' per conto suo, ma non e' l'unica a doverlo sapere: il
 * menu di navigazione cambia forma finche' la configurazione e' aperta, e le
 * altre pagine non devono essere raggiungibili. Se ognuno se lo ricalcolasse a
 * modo suo, prima o poi due parti dell'app direbbero cose diverse sullo stesso
 * negozio.
 *
 * Tutto quello che serve sta sul database: nessuna chiamata a Shopify, perche'
 * questo viene letto a ogni apertura di ogni pagina.
 */
export async function loadSetupInput(shopDomain: string): Promise<StepInput | null> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true, supabaseOAuthToken: true, trackingSetup: true },
  });
  if (!shop) return null;

  const connectedAt = shop.supabaseConfig?.connectionVerifiedAt ?? null;

  // Le corse recenti servono solo a sapere se la prima sincronizzazione di
  // QUESTO collegamento e' arrivata in fondo.
  const recentJobs = await prisma.syncJob.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: { jobType: true, status: true, startedAt: true },
  });

  // Vale per il collegamento di adesso, non per uno precedente: e' la stessa
  // regola che governa i passi nella dashboard.
  const forThisConnection = (moment: Date | null) =>
    moment != null && connectedAt != null && moment >= connectedAt;

  return {
    accountConnected: shop.supabaseOAuthToken !== null,
    databaseConnected: connectedAt != null,
    trackingChecked: forThisConnection(shop.trackingCheckedAt),
    serverSideAnswered: shop.trackingSetup !== null,
    planConfirmed:
      forThisConnection(shop.planConfirmedAt) &&
      resolveSyncState(recentJobs, connectedAt) === 'completed',
  };
}

/**
 * La configurazione non ha piu' niente da chiedere.
 *
 * Un negozio che non risulta ancora sul database e' all'inizio di tutto, quindi
 * non e' concluso: e' il primo istante dell'installazione.
 */
export async function isSetupComplete(shopDomain: string): Promise<boolean> {
  const input = await loadSetupInput(shopDomain);
  return input != null && allStepsComplete(resolveStepStates(input));
}
