import type { Prisma } from '@prisma/client';
import { prisma } from '~/db.server';

// Il passaggio "abbonamento confermato -> piano scritto sullo shop" ha due
// chiamanti diversi: la callback di ritorno da Shopify e il webhook
// app_subscriptions/update, che arriva anche quando il merchant approva su un
// altro dispositivo o quando Shopify cambia stato per conto suo. Tenerlo in un
// posto solo evita che le due strade scrivano campi diversi e lascino lo shop
// in stati che nessuno ha previsto.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ricompone il gid di un abbonamento dal solo id numerico.
 *
 * Serve perche' in giro conserviamo l'id nudo (`Shop.activeChargeId`,
 * `BillingCharge.shopifyChargeId`, il `charge_id` che Shopify mette in
 * querystring) mentre le GraphQL vogliono il gid completo.
 */
export function appSubscriptionGid(chargeId: string | bigint | number): string {
  return `gid://shopify/AppSubscription/${chargeId}`;
}

export interface ApplyPlanOptions {
  /** `Shop.id`, non il dominio. */
  shopId: string;
  /** Nome esatto dalla colonna `plan_name`: e' quello che i limiti leggono. */
  planName: string;
  /**
   * Id numerico dell'abbonamento che sostiene il piano, come stringa.
   * Null sui piani gratuiti, che non hanno nessun addebito dietro.
   */
  chargeId: string | null;
  /** Giorni di prova effettivi dell'abbonamento. Null o 0 = nessuna prova. */
  trialDays?: number | null;
  /** Istante di riferimento: iniettabile dai test. */
  now?: Date;
}

/**
 * Porta lo shop sul piano indicato.
 *
 * Non tocca `lastSyncedPlan`: e' la differenza fra quello e `currentPlan` a
 * dire alla dashboard che c'e' un allineamento da fare e quale banner mostrare.
 * Azzerarlo qui spegnerebbe entrambe le cose.
 */
export async function applyPlanToShop(opts: ApplyPlanOptions): Promise<void> {
  const now = opts.now ?? new Date();
  const trialDays = opts.trialDays ?? 0;
  const inTrial = trialDays > 0;

  const data: Prisma.ShopUpdateInput = {
    currentPlan: opts.planName,
    activeChargeId: opts.chargeId,
    planStartedAt: now,
    billingCycle: 'monthly',
    isInTrial: inTrial,
    trialEndsAt: inTrial ? new Date(now.getTime() + trialDays * DAY_MS) : null,
  };

  // Un piano a pagamento appena attivato riapre l'app a chi era finito in
  // PENDING alla fine della prova: e' quello che gli promettiamo a schermo
  // ("Aggiorna il piano per riattivarle"), e senza questa riga il merchant
  // pagherebbe restando sospeso. DISABLED invece non si sblocca mai da solo:
  // e' una decisione dell'owner, non la scadenza di un periodo.
  if (opts.chargeId) {
    const current = await prisma.shop.findUnique({
      where: { id: opts.shopId },
      select: { authorization: true, trackingAuthorization: true },
    });
    if (current?.authorization === 'PENDING') data.authorization = 'ENABLED';
    if (current?.trackingAuthorization === 'PENDING') data.trackingAuthorization = 'ENABLED';
  }

  await prisma.shop.update({ where: { id: opts.shopId }, data });
}
