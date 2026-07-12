import { Queue } from 'bullmq';
import { getRedisUrl } from './connection.server';

const redisUrl = getRedisUrl();

// Parse Redis URL to extract connection options for BullMQ
const url = new URL(redisUrl);
const connectionOptions = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  username: url.username || undefined,
  password: url.password || undefined,
  db: url.pathname ? parseInt(url.pathname.slice(1), 10) : 0,
  lazyConnect: true,
};

export const syncQueue = new Queue('sync-queue', {
  connection: connectionOptions as any,
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
});

export type SyncJobData =
  | { type: 'periodic-sync-check'; shopId: string }
  | { type: 'initial-bulk-sync'; shopId: string }
  | { type: 'manual-sync'; shopId: string }
  | { type: 'retry-failed-webhook'; syncJobId: string; webhookPayload: any; attempt: number };
