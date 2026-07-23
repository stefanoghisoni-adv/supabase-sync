// app/lib/cache/stats-cache.server.ts
// Cache best-effort (Redis/Upstash) dei conteggi di readiness: alla riapertura
// dell'app li mostriamo SUBITO e li aggiorniamo live in background. Se Redis non
// è raggiungibile la cache "sparisce" senza mai bloccare: si ricalcola live.
import type Redis from 'ioredis';
import { getRedisUrl } from '../queue/connection.server';

// ioredis è importato dinamicamente: il build server di Remix è un bundle unico,
// quindi un import statico lo caricherebbe a ogni cold start — anche sulle rotte
// che la cache non la usano. Qui il costo si paga solo al primo accesso reale.
let clientPromise: Promise<Redis> | null = null;

function getClient(): Promise<Redis> {
  if (!clientPromise) {
    const url = new URL(getRedisUrl());
    clientPromise = import('ioredis').then(
      ({ default: RedisClient }) =>
        new RedisClient({
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          username: url.username || undefined,
          password: url.password || undefined,
          tls: url.protocol === 'rediss:' ? {} : undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
        }),
    );
  }
  return clientPromise;
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
    const redis = await getClient();
    const raw = await redis.get(key(shopId));
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
    const redis = await getClient();
    await redis.set(key(shopId), payload, 'EX', TTL_SECONDS);
  } catch (err) {
    console.error('[stats-cache] set fallito (ignoro):', err);
  }
}

export interface CustomerStats {
  totalCustomers: number;
  optIn: number;
  optOut: number;
}

function customerKey(shopId: string): string {
  return `stats:customers:${shopId}`;
}

export async function getCustomerStatsCache(
  shopId: string,
): Promise<(CustomerStats & { computedAt: string }) | null> {
  try {
    const redis = await getClient();
    const raw = await redis.get(customerKey(shopId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[stats-cache] get clienti fallito (ignoro, calcolo live):', err);
    return null;
  }
}

export async function setCustomerStatsCache(
  shopId: string,
  stats: CustomerStats,
): Promise<void> {
  try {
    const payload = JSON.stringify({ ...stats, computedAt: new Date().toISOString() });
    const redis = await getClient();
    await redis.set(customerKey(shopId), payload, 'EX', TTL_SECONDS);
  } catch (err) {
    console.error('[stats-cache] set clienti fallito (ignoro):', err);
  }
}
