import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { authorizationMessage, normalizeAuthorization } from '~/utils/authorization.server';
import { canAccessPlanTab } from '~/components/Billing/plan-access';
import {
  cancelAppSubscription,
  createAppSubscription,
  isDevelopmentStore,
} from '~/lib/billing/subscription.server';
import { appSubscriptionGid, applyPlanToShop } from '~/lib/billing/apply-plan.server';
import { embeddedContextParams } from '~/lib/billing/embedded-return.server';

// Avvio del cambio di piano. Qui NON si attiva niente: l'abbonamento nasce in
// attesa di conferma e diventa effettivo solo in /billing/callback, dopo che
// Shopify ci ha detto che il merchant ha davvero approvato l'addebito.

/**
 * Risposta letta dalla tab Piano.
 *
 * `confirmationUrl` = c'e' un addebito da confermare, il client deve uscire dal
 * riquadro verso quell'indirizzo. `ok` = piano applicato subito (caso gratuito).
 * `error` = testo gia' pronto per un banner.
 */
export type SubscribeResponse =
  | { confirmationUrl: string }
  | { ok: true }
  | { error: string };

// Nessun errore mostrato al merchant racconta cosa e' andato storto dietro le
// quinte: non gli serve e non deve finire in uno screenshot al supporto.
const GENERIC_ERROR = 'Non è stato possibile avviare il cambio di piano. Riprova.';

/** Confronto fra nomi di piano tollerante a maiuscole e spazi. */
function planId(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/** Solo un id numerico puo' essere ricomposto in un gid: il resto si ignora. */
function numericChargeId(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return /^\d+$/.test(v) ? v : null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  if (request.method !== 'POST') {
    return json<SubscribeResponse>({ error: GENERIC_ERROR }, { status: 405 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    return json<SubscribeResponse>({ error: GENERIC_ERROR }, { status: 404 });
  }

  // Il negozio bloccato dall'owner non compra nulla. La sospensione per prova
  // scaduta (PENDING) invece deve poter comprare: e' l'unica strada che gli
  // indichiamo per tornare operativo, sbarrarla lo chiuderebbe fuori per sempre.
  const authorization = normalizeAuthorization(shop.authorization);
  if (authorization === 'DISABLED') {
    return json<SubscribeResponse>(
      { error: authorizationMessage(authorization) },
      { status: 403 },
    );
  }

  // Piani interni assegnati dall'owner: non hanno limiti e non si acquistano.
  if (!canAccessPlanTab(shop.currentPlan)) {
    return json<SubscribeResponse>(
      { error: 'Il tuo piano non prevede acquisti né rinnovi.' },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const requestedName = String(form.get('plan') ?? '').trim();
  if (!requestedName) {
    return json<SubscribeResponse>({ error: 'Scegli un piano per continuare.' }, { status: 400 });
  }

  const plan = await prisma.plan.findUnique({ where: { planName: requestedName } });
  if (!plan || !canAccessPlanTab(plan.planName)) {
    return json<SubscribeResponse>(
      { error: 'Il piano scelto non è disponibile.' },
      { status: 400 },
    );
  }
  if (planId(plan.planName) === planId(shop.currentPlan)) {
    return json<SubscribeResponse>({ error: 'Stai già usando questo piano.' }, { status: 400 });
  }

  const price = Number(plan.priceMonthly);

  try {
    // Piano gratuito: non c'e' niente da far confermare, quindi si chiude subito
    // l'abbonamento in corso (altrimenti Shopify continuerebbe ad addebitarlo) e
    // si applica il piano senza uscire dal riquadro.
    if (!(price > 0)) {
      const activeChargeId = numericChargeId(shop.activeChargeId);
      if (activeChargeId) {
        await cancelAppSubscription(admin, appSubscriptionGid(activeChargeId));
        await prisma.billingCharge.updateMany({
          where: { shopId: shop.id, shopifyChargeId: BigInt(activeChargeId) },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
      }
      await applyPlanToShop({
        shopId: shop.id,
        planName: plan.planName,
        chargeId: null,
        trialDays: null,
      });
      return json<SubscribeResponse>({ ok: true });
    }

    // Sui negozi di sviluppo Shopify rifiuta gli addebiti reali: l'abbonamento
    // va creato di prova, altrimenti la mutation fallisce e il merchant resta
    // fermo sulla tab senza capire perche'.
    const test = await isDevelopmentStore(admin);

    const requestUrl = new URL(request.url);
    const params = embeddedContextParams({
      requestUrl,
      shopDomain: shop.shopDomain,
      host: typeof form.get('host') === 'string' ? String(form.get('host')) : null,
    });
    const returnUrl = new URL(
      `/billing/callback?${params.toString()}`,
      process.env.SHOPIFY_APP_URL || requestUrl.origin,
    ).toString();

    const created = await createAppSubscription(admin, {
      planName: plan.planName,
      priceMonthly: price,
      trialDays: plan.trialDays,
      returnUrl,
      test,
    });

    // La riga nasce "pending" apposta: e' la traccia che ci permette, al
    // ritorno, di riconoscere un addebito che abbiamo avviato noi.
    await prisma.billingCharge.create({
      data: {
        shopId: shop.id,
        shopifyChargeId: created.chargeId,
        planType: plan.planName,
        price: plan.priceMonthly,
        billingCycle: 'monthly',
        status: 'pending',
        trialDays: plan.trialDays ?? 0,
        confirmationUrl: created.confirmationUrl,
      },
    });

    return json<SubscribeResponse>({ confirmationUrl: created.confirmationUrl });
  } catch (e) {
    console.error(
      '[billing.subscribe]',
      e instanceof Error ? e.message : 'errore sconosciuto',
    );
    return json<SubscribeResponse>({ error: GENERIC_ERROR }, { status: 500 });
  }
}
