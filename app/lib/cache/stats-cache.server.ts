// app/lib/cache/stats-cache.server.ts
// Cache best-effort (Redis/Upstash) dei conteggi di readiness: alla riapertura
// dell'app li mostriamo SUBITO e li aggiorniamo live in background. Se Redis non
// è raggiungibile la cache "sparisce" senza mai bloccare: si ricalcola live.
import Redis from 'ioredis';
import { getRedisUrl } from '../queue/connection.server';

let client: Redis | null = null;

function getClient(): Redis {
  if (client) return client;
  const url = new URL(getRedisUrl());
  client = new Redis({
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  return client;
}

export interface ReadinessStats {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
}

// TTL alto: è solo un limite massimo di obsolescenza. In pratica ogni apertura
// dell'app innesca un refresh live che riscrive la cache.
const TTL_SECONDS = 24 * 60 * 60;

function key(shopId: string): string {
  return `stats:readiness:${shopId}`;
}

export async function getReadinessCache(
  shopId: string,
): Promise<(ReadinessStats & { computedAt: string }) | null> {
  try {
    const raw = await getClient().get(key(shopId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[stats-cache] get fallito (ignoro, calcolo live):', err);
    return null;
  }
}

export async function setReadinessCache(
  shopId: string,
  stats: ReadinessStats,
): Promise<void> {
  try {
    const payload = JSON.stringify({ ...stats, computedAt: new Date().toISOString() });
    await getClient().set(key(shopId), payload, 'EX', TTL_SECONDS);
  } catch (err) {
    console.error('[stats-cache] set fallito (ignoro):', err);
  }
}
