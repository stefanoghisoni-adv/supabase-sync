import type { Queue } from 'bullmq';
import { getRedisUrl } from './connection.server';

// BullMQ (~5 MB, con ioredis al seguito) NON va importato staticamente: il build
// server di Remix è un bundle unico, quindi un import statico qui verrebbe
// caricato e parsato a ogni cold start — anche per un semplice render della
// dashboard, che la coda non la tocca nemmeno. Import dinamico + memoizzazione:
// il costo si paga solo nelle rotte che accodano o drenano davvero i job.

function buildConnectionOptions() {
  const url = new URL(getRedisUrl());
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== '/' ? parseInt(url.pathname.slice(1), 10) : 0,
    // Upstash (e ogni Redis gestito) usa lo schema rediss:// → serve TLS.
    // Senza questo, BullMQ tenta una connessione in chiaro e ogni comando
    // (es. queue.add) fallisce, facendo crashare l'action di sync.
    tls: url.protocol === 'rediss:' ? {} : undefined,
    lazyConnect: true,
  };
}

let queuePromise: Promise<Queue> | null = null;

// Coda condivisa, istanziata al primo uso. La promise è memoizzata: chiamate
// concorrenti nella stessa invocazione riusano la stessa istanza (e la stessa
// connessione Redis) invece di aprirne una ciascuna.
export function getSyncQueue(): Promise<Queue> {
  if (!queuePromise) {
    queuePromise = import('bullmq').then(
      ({ Queue: BullQueue }) =>
        new BullQueue('sync-queue', {
          connection: buildConnectionOptions() as any,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 60000, // 1 minute base delay
            },
            removeOnComplete: {
              age: 86400, // 24 hours
              count: 1000,
            },
            removeOnFail: {
              age: 604800, // 7 days
              count: 5000,
            },
          },
        }),
    );
  }
  return queuePromise;
}

export type SyncJobData =
  | { type: 'periodic-sync-check'; shopId: string }
  | { type: 'initial-bulk-sync'; shopId: string }
  | { type: 'manual-sync'; shopId: string }
  | { type: 'retry-failed-webhook'; syncJobId: string; webhookPayload: any; attempt: number };
