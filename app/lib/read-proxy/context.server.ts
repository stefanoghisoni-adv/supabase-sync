import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';
import {
  grantsDataAccess,
  normalizeAuthorization,
  type AuthorizationState,
} from '~/utils/authorization.server';
import { hashReadProxyToken } from './token.server';

export interface ShopReadContext {
  shopId: string;
  // Stato normalizzato, per messaggi e diagnostica. NON usarlo come gate.
  authorization: AuthorizationState;
  // Unico gate valido per l'accesso ai dati: fail-closed sul valore grezzo.
  canReadData: boolean;
  projectRef: string;
  serviceRoleKey: string;
  customersEnabled: boolean;
}

export type ReadContextResult =
  | { kind: 'unknown' }
  | { kind: 'not_configured' }
  | { kind: 'ok'; ctx: ShopReadContext };

// Cache per-istanza: evita un round-trip al DB owner ad ogni lettura di
// tracciamento. TTL 30s = finestra massima di obsolescenza dello stato shop.
const TTL_MS = 30_000;
const cache = new Map<string, { result: ReadContextResult; expiresAt: number }>();

export function clearReadContextCache(): void {
  cache.clear();
}

export async function resolveShopReadContext(token: string): Promise<ReadContextResult> {
  const hash = hashReadProxyToken(token);
  const now = Date.now();
  const cached = cache.get(hash);
  if (cached && cached.expiresAt > now) return cached.result;

  const result = await loadReadContext(hash);
  cache.set(hash, { result, expiresAt: now + TTL_MS });
  return result;
}

async function loadReadContext(hash: string): Promise<ReadContextResult> {
  const shop = await prisma.shop.findUnique({
    where: { readProxyTokenHash: hash },
    include: { supabaseConfig: true },
  });
  if (!shop) return { kind: 'unknown' };

  const config = shop.supabaseConfig;
  if (!config?.supabaseProjectRef || !config.supabaseServiceRoleKey) {
    return { kind: 'not_configured' };
  }

  let serviceRoleKey: string;
  try {
    serviceRoleKey = decrypt(config.supabaseServiceRoleKey);
  } catch {
    return { kind: 'not_configured' };
  }

  const plan = await prisma.plan.findUnique({ where: { planName: shop.currentPlan } });

  return {
    kind: 'ok',
    ctx: {
      shopId: shop.id,
      authorization: normalizeAuthorization(shop.authorization),
      canReadData: grantsDataAccess(shop.authorization),
      projectRef: config.supabaseProjectRef,
      serviceRoleKey,
      customersEnabled: plan?.customersSyncEnabled ?? false,
    },
  };
}
