import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';

// Sottoinsieme minimo della sessione Shopify che ci serve per materializzare
// il record shop. Evita l'accoppiamento diretto col tipo Session di Shopify.
interface ShopSession {
  shop: string;
  accessToken?: string;
  scope?: string;
}

// Dati di creazione di un nuovo shop a partire dalla sessione Shopify.
// Condiviso tra l'hook afterAuth e il self-heal dei loader.
export function shopCreateData(session: ShopSession) {
  return {
    shopDomain: session.shop,
    accessToken: encrypt(session.accessToken ?? ''),
    scopes: session.scope ?? '',
    currentPlan: 'free',
    isInTrial: true,
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    installedAt: new Date(),
  };
}

// Ritorna lo shop della sessione corrente, creandolo se manca (self-heal).
// Una sessione valida senza riga shop — reinstallazione, cancellazione manuale
// del record, o race durante l'embedded auth prima che afterAuth completi — non
// deve mandare l'app in 404: il record viene materializzato al volo.
export async function getOrCreateShop(session: ShopSession) {
  return prisma.shop.upsert({
    where: { shopDomain: session.shop },
    create: shopCreateData(session),
    update: {},
    include: { supabaseConfig: true },
  });
}
