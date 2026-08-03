import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { verifyWebhook } from '~/lib/webhooks/verify.server';
import { prisma } from '~/db.server';
import { applyPlanToShop } from '~/lib/billing/apply-plan.server';
import { parseGidId } from '~/lib/billing/subscription.server';
import { subscriptionOutcome } from '~/lib/billing/subscription-status';

/**
 * Webhook app_subscriptions/update: ricevuto quando Shopify cambia lo stato di
 * un abbonamento senza che il merchant apra l'app — disdetta dal pannello del
 * negozio, carta rifiutata, scadenza, congelamento.
 *
 * La route billing/callback copre il caso "merchant approva e torna sull'app",
 * ma un abbonamento puo' cambiare stato in qualsiasi momento: senza questo
 * webhook il negozio continuerebbe a usare un piano che non paga piu'.
 *
 * Punto delicato: durante un cambio di piano la callback cancella di proposito
 * l'abbonamento precedente, e Shopify manda un CANCELLED per quello. Senza il
 * confronto con `activeChargeId`, un merchant che ha appena pagato un upgrade
 * verrebbe immediatamente retrocesso al piano gratuito.
 */

interface AppSubscriptionPayload {
  app_subscription?: {
    admin_graphql_api_id?: string;
    name?: string;
    status?: string;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

  if (!hmac || !verifyWebhook(body, hmac)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  const shopDomain = request.headers.get('X-Shopify-Shop-Domain');
  if (!shopDomain) {
    return json({ error: 'Missing shop domain' }, { status: 400 });
  }

  try {
    const payload: AppSubscriptionPayload = JSON.parse(body);
    const subscription = payload.app_subscription;

    if (
      !subscription?.admin_graphql_api_id ||
      !subscription.name ||
      !subscription.status
    ) {
      console.warn('[app_subscriptions/update] payload incompleto:', payload);
      return json({ ok: true }, { status: 200 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });

    // Negozio disinstallato o mai visto: niente da fare, ma rispondi 200 perche'
    // Shopify non deve riprovare all'infinito.
    if (!shop) {
      console.log(
        `[app_subscriptions/update] negozio ${shopDomain} sconosciuto, ignoro`,
      );
      return json({ ok: true }, { status: 200 });
    }

    const subscriptionId = parseGidId(subscription.admin_graphql_api_id);
    const subscriptionIdStr = subscriptionId.toString();
    const outcome = subscriptionOutcome(subscription.status);

    if (outcome === 'ignore') {
      // PENDING, ACCEPTED, o stati sconosciuti: non toccare niente.
      console.log(
        `[app_subscriptions/update] stato ${subscription.status} ignorato per ${shopDomain}`,
      );
      return json({ ok: true }, { status: 200 });
    }

    if (outcome === 'active') {
      // Abbonamento attivo: allinea il piano se il nome e' nel listino.
      const plan = await prisma.plan.findUnique({
        where: { planName: subscription.name },
      });

      if (!plan) {
        // Nome non nel listino: non e' un abbonamento gestito da questa app.
        console.log(
          `[app_subscriptions/update] piano "${subscription.name}" non nel listino, ignoro`,
        );
        return json({ ok: true }, { status: 200 });
      }

      // Gia' allineato: non riscrivere. Shopify puo' rimandare lo stesso ACTIVE
      // piu' volte, e riapplicare il piano farebbe ripartire da capo il periodo
      // di prova (trialEndsAt viene ricalcolato da adesso), regalando giorni
      // gratis a ogni consegna ripetuta.
      if (shop.currentPlan === plan.planName && shop.activeChargeId === subscriptionIdStr) {
        console.log(
          `[app_subscriptions/update] ${shopDomain} e' gia' su ${plan.planName}, niente da fare`,
        );
        return json({ ok: true }, { status: 200 });
      }

      await applyPlanToShop({
        shopId: shop.id,
        planName: plan.planName,
        chargeId: subscriptionIdStr,
        trialDays: plan.trialDays,
      });

      // Segna la BillingCharge come attiva, se esiste. updateMany filtrato sullo
      // shop: un charge_id che arriva da fuori non puo' toccare le righe di un
      // altro negozio.
      await prisma.billingCharge.updateMany({
        where: { shopId: shop.id, shopifyChargeId: subscriptionId },
        data: { status: 'active', activatedAt: new Date() },
      });

      console.log(
        `[app_subscriptions/update] piano ${plan.planName} applicato a ${shopDomain}`,
      );
      return json({ ok: true }, { status: 200 });
    }

    // outcome === 'ended': CANCELLED, EXPIRED, DECLINED, FROZEN.
    //
    // PUNTO CRITICO: agisci SOLO se questo abbonamento e' quello attivo dello
    // shop. Durante un cambio di piano, la callback cancella di proposito
    // l'abbonamento precedente e Shopify manda un CANCELLED per quello. Senza
    // questo controllo, il merchant che ha appena pagato un upgrade verrebbe
    // immediatamente retrocesso al piano gratuito.
    if (shop.activeChargeId !== subscriptionIdStr) {
      console.log(
        `[app_subscriptions/update] abbonamento ${subscriptionIdStr} terminato, ma non e' l'attivo (${shop.activeChargeId}) per ${shopDomain}, ignoro`,
      );
      return json({ ok: true }, { status: 200 });
    }

    // E' l'abbonamento attivo che e' terminato: riporta al piano gratuito.
    const freePlan = await prisma.plan.findFirst({
      where: { priceMonthly: 0 },
      orderBy: { createdAt: 'asc' },
    });

    if (!freePlan) {
      // Nessun piano gratuito nel listino: non inventare un nome, logga e basta.
      console.error(
        `[app_subscriptions/update] nessun piano gratuito configurato, impossibile retrocedere ${shopDomain}`,
      );
      return json({ ok: true }, { status: 200 });
    }

    await applyPlanToShop({
      shopId: shop.id,
      planName: freePlan.planName,
      chargeId: null,
      trialDays: null,
    });

    // Segna la BillingCharge come cancellata.
    await prisma.billingCharge.updateMany({
      where: { shopId: shop.id, shopifyChargeId: subscriptionId },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    console.log(
      `[app_subscriptions/update] abbonamento ${subscriptionIdStr} terminato, ${shopDomain} riportato al piano ${freePlan.planName}`,
    );
    return json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[app_subscriptions/update] errore:', error);

    // Non creare SyncJob: questo non e' un job di sync, e' un aggiornamento
    // amministrativo. Logghiamo solo a console.
    return json({ ok: true }, { status: 200 });
  }
}
