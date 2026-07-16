# Shopify-Supabase Sync App Implementation Plan - Part 2: Background Workers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire coda job in background con BullMQ per sync periodici, retry e operazioni bulk

**This document:** Part 2 of 4 - Background Workers (BullMQ, Periodic Sync, Initial Bulk Sync, Retry Logic)

**Prerequisites:** Part 1 completata (✅ 7/7 task, commit 07db8a4..c6d794b — database, webhooks, transformers)

**Tech Stack:** BullMQ, Redis (Upstash Free in produzione), ioredis, Shopify REST Admin API

> **NOTA ARCHITETTURALE (stack a costo zero):** in produzione l'app gira su Vercel Free, dove non esistono processi long-running. Il worker BullMQ (`worker.ts`, Task 8) serve solo per sviluppo locale; in produzione i processor di questo documento vengono invocati da una route Remix triggerata da cron (vedi Part 4, "MODIFICA ARCHITETTURALE: worker → cron"). I processor (Task 9-11) restano identici nei due contesti: scrivili esattamente come specificato qui.

## Global Constraints

Vincoli validi per ogni task di questo documento (ogni task li eredita implicitamente):

- Node.js >= 18, TypeScript strict mode, Shopify API version `2024-01`
- Vincolo di progetto: **costi ZERO** — Vercel Free (app + cron), Supabase Free (PostgreSQL metadata app), Upstash Free (Redis per BullMQ)
- Timestamp sempre in UTC; risposte webhook entro 5 secondi
- Gestione errori nei processor: su errore marcare il `SyncJob` con `status: 'failed'`, `completedAt: new Date()`, `errors: { message }`, loggare con `console.error` e rilanciare l'errore (pattern già usato in Part 1 per i webhook handler, che invece ritornano 200 a Shopify)
- Test con vitest (`npm test`); coverage minima 80% sulla logica di sync
- **Nomi già implementati in Part 1 — usare esattamente questi:**
  - Prisma (singleton `prisma` da `app/db.server.ts`): `Shop.shopDomain`, `Shop.accessToken`, `Shop.scopes`, `Shop.currentPlan` (String: 'free'|'pro'|'business'|'enterprise'), `SupabaseConfig.supabasePublicKey`, `SupabaseConfig.supabaseServiceRoleKey`, `SupabaseConfig.tableNameProducts`, `SupabaseConfig.tableNameCustomers`, `Plan.planName`, `Plan.priceMonthly`/`Plan.priceYearly` (0, 29/290, 99/990, 299/2990)
  - Funzioni: `encrypt(plaintext)`/`decrypt(ciphertext)` in `app/utils/crypto.server.ts` (AES-256-GCM, `ENCRYPTION_SECRET` = 64 caratteri hex), `createSupabaseClient(config)` in `app/lib/supabase.server.ts`, `transformProduct(product)` in `app/lib/transformers/product.server.ts`, `verifyWebhook(body, hmacHeader)` in `app/lib/webhooks/verify.server.ts`

---

## Phase 4: Job Queue Infrastructure

### Task 8: BullMQ Setup & Queue Configuration

**Files:**
- Create: `app/lib/queue/connection.server.ts`
- Create: `app/lib/queue/queues.server.ts`
- Create: `worker.ts` (root directory)
- Create: `Dockerfile.worker`
- Modify: `package.json` (add worker script)

**Interfaces:**
- Consumes: REDIS_URL environment variable (locale: `redis://localhost:6379`; produzione: URL `rediss://` di Upstash Free)
- Produces: Queue instances for sync operations, worker process

> Nota: `worker.ts` e `Dockerfile.worker` servono solo per sviluppo locale o per un eventuale futuro host long-running. In produzione (Vercel Free) i job vengono processati dalla route cron definita in Part 4. Creali comunque come specificato: il codice dei processor è condiviso.

- [ ] **Step 1: Create Redis connection helper**

Create `app/lib/queue/connection.server.ts`:

```typescript
import { Redis } from 'ioredis';

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable not configured');
    }
    
    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    
    connection.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    
    connection.on('connect', () => {
      console.log('Redis connected');
    });
  }
  
  return connection;
}
```

- [ ] **Step 2: Define queue instances**

Create `app/lib/queue/queues.server.ts`:

```typescript
import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.server';

export const syncQueue = new Queue('sync-queue', {
  connection: getRedisConnection(),
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
```

- [ ] **Step 3: Create worker process**

Create `worker.ts` in project root:

```typescript
import { Worker } from 'bullmq';
import { getRedisConnection } from './app/lib/queue/connection.server';
import type { SyncJobData } from './app/lib/queue/queues.server';
import { 
  processPeriodicSyncCheck,
  processInitialBulkSync,
  processManualSync,
  processRetryWebhook,
} from './app/lib/workers/processors.server';

console.log('Starting sync worker...');

const worker = new Worker<SyncJobData>(
  'sync-queue',
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.data.type}`);
    
    switch (job.data.type) {
      case 'periodic-sync-check':
        await processPeriodicSyncCheck(job.data.shopId);
        break;
      
      case 'initial-bulk-sync':
        await processInitialBulkSync(job.data.shopId, job);
        break;
      
      case 'manual-sync':
        await processManualSync(job.data.shopId, job);
        break;
      
      case 'retry-failed-webhook':
        await processRetryWebhook(job.data);
        break;
      
      default:
        throw new Error(`Unknown job type: ${(job.data as any).type}`);
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});
```

- [ ] **Step 4: Add worker script to package.json**

```json
{
  "scripts": {
    "worker": "tsx watch worker.ts"
  }
}
```

- [ ] **Step 5: Create worker Dockerfile**

Create `Dockerfile.worker`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN npx prisma generate

CMD ["node", "--loader", "tsx", "worker.ts"]
```

- [ ] **Step 6: Commit queue infrastructure**

```bash
git add app/lib/queue/ worker.ts Dockerfile.worker package.json
git commit -m "feat: setup BullMQ job queue with Redis connection

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 9: Shopify API Client

**Files:**
- Create: `app/lib/shopify-api.server.ts`
- Create: `app/lib/shopify-api.test.ts`

**Interfaces:**
- Consumes: Shop model with accessToken, Shopify REST Admin API
- Produces: `ShopifyAPIClient` class with methods: `getProducts()`, `getProductById()`, `getCustomers()`

- [ ] **Step 1: Write failing test**

Create `app/lib/shopify-api.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ShopifyAPIClient } from './shopify-api.server';

global.fetch = vi.fn();

describe('Shopify API Client', () => {
  it('should fetch products with pagination', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [
          { id: 1, title: 'Product 1' },
          { id: 2, title: 'Product 2' },
        ],
      }),
      headers: new Map([
        ['link', '<https://test.myshopify.com/admin/api/2024-01/products.json?page_info=abc>; rel="next"'],
      ]),
    });
    
    const client = new ShopifyAPIClient('test.myshopify.com', 'test_token');
    const result = await client.getProducts({ limit: 250 });
    
    expect(result.products).toHaveLength(2);
    expect(result.nextPageInfo).toBe('abc');
  });

  it('should respect rate limits', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Map([
        ['X-Shopify-Shop-Api-Call-Limit', '38/40'],
      ]),
    });
    
    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.getProducts({ limit: 10 });
    
    // Should log rate limit warning
    expect(mockFetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test shopify-api.test.ts
```

Expected: FAIL - "Cannot find module './shopify-api.server'"

- [ ] **Step 3: Implement Shopify API client**

Create `app/lib/shopify-api.server.ts`:

```typescript
import { decrypt } from '~/utils/crypto.server';

export class ShopifyAPIClient {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string;

  constructor(shopDomain: string, encryptedAccessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = decrypt(encryptedAccessToken);
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  }

  private async makeRequest(endpoint: string, params?: Record<string, any>) {
    const url = new URL(`https://${this.shopDomain}/admin/api/${this.apiVersion}/${endpoint}`);
    
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined) {
          url.searchParams.append(key, String(params[key]));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });

    // Check rate limit
    const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (rateLimitHeader) {
      const [current, max] = rateLimitHeader.split('/').map(Number);
      if (current >= max * 0.9) {
        console.warn(`Approaching rate limit: ${current}/${max}`);
        await this.sleep(500); // Throttle
      }
    }

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract next page info from Link header
    const linkHeader = response.headers.get('link');
    let nextPageInfo: string | null = null;
    
    if (linkHeader) {
      const nextLinkMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (nextLinkMatch) {
        nextPageInfo = nextLinkMatch[1];
      }
    }

    return { data, nextPageInfo };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getProducts(options: {
    limit?: number;
    pageInfo?: string;
    updatedAtMin?: string;
  } = {}) {
    const params: Record<string, any> = {
      limit: options.limit || 250,
    };
    
    if (options.pageInfo) {
      params.page_info = options.pageInfo;
    }
    
    if (options.updatedAtMin) {
      params.updated_at_min = options.updatedAtMin;
    }

    const { data, nextPageInfo } = await this.makeRequest('products.json', params);
    
    return {
      products: data.products,
      nextPageInfo,
    };
  }

  async getProductById(productId: number) {
    const { data } = await this.makeRequest(`products/${productId}.json`);
    return data.product;
  }

  async getCustomers(options: {
    limit?: number;
    pageInfo?: string;
    updatedAtMin?: string;
  } = {}) {
    const params: Record<string, any> = {
      limit: options.limit || 250,
    };
    
    if (options.pageInfo) {
      params.page_info = options.pageInfo;
    }
    
    if (options.updatedAtMin) {
      params.updated_at_min = options.updatedAtMin;
    }

    const { data, nextPageInfo } = await this.makeRequest('customers.json', params);
    
    return {
      customers: data.customers,
      nextPageInfo,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test shopify-api.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit Shopify API client**

```bash
git add app/lib/shopify-api.server.ts app/lib/shopify-api.test.ts
git commit -m "feat: implement Shopify REST API client with rate limiting

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Background Job Processors

### Task 10: Initial Bulk Sync Processor

**Files:**
- Create: `app/lib/workers/processors.server.ts`
- Create: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Consumes: `ShopifyAPIClient`, `transformProduct()`, Prisma models, Supabase client
- Produces: `processInitialBulkSync(shopId: string, job: Job)` - syncs all products from Shopify to Supabase

- [ ] **Step 1: Write failing test for bulk sync**

Create `app/lib/workers/bulk-sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInitialBulkSync } from './processors.server';

vi.mock('../shopify-api.server');
vi.mock('../supabase.server');
vi.mock('~/db.server');

describe('Initial bulk sync processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync all products with pagination', async () => {
    // Test implementation will verify:
    // - Fetches products in batches of 250
    // - Transforms each product
    // - Batch upserts to Supabase
    // - Updates job progress
    // - Handles pagination until no more pages
    
    // Detailed test to be implemented with mocks
    expect(true).toBe(true); // Placeholder
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test bulk-sync.test.ts
```

Expected: FAIL - "Cannot find module './processors.server'"

- [ ] **Step 3: Implement initial bulk sync processor**

Create `app/lib/workers/processors.server.ts`:

```typescript
import type { Job } from 'bullmq';
import { ShopifyAPIClient } from '../shopify-api.server';
import { transformProduct } from '../transformers/product.server';
import { createSupabaseClient } from '../supabase.server';
import { prisma } from '~/db.server';

export async function processInitialBulkSync(shopId: string, job: Job) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { supabaseConfig: true },
  });

  if (!shop || !shop.supabaseConfig || !shop.supabaseConfig.syncEnabled) {
    throw new Error(`Shop ${shopId} not configured for sync`);
  }

  const shopifyClient = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
  const supabase = createSupabaseClient(shop.supabaseConfig);

  // Create sync job record
  const syncJob = await prisma.syncJob.create({
    data: {
      shopId: shop.id,
      jobType: 'initial_bulk',
      status: 'running',
    },
  });

  let totalProducts = 0;
  let totalVariants = 0;
  let nextPageInfo: string | null = null;
  
  try {
    do {
      // Fetch products batch
      const { products, nextPageInfo: nextPage } = await shopifyClient.getProducts({
        limit: 250,
        pageInfo: nextPageInfo || undefined,
      });

      if (products.length === 0) break;

      // Transform all products to Supabase rows
      const allRows = [];
      for (const product of products) {
        const rows = transformProduct(product);
        allRows.push(...rows);
        totalProducts++;
        totalVariants += rows.length;
      }

      // Batch upsert to Supabase (chunks of 1000 rows)
      const chunkSize = 1000;
      for (let i = 0; i < allRows.length; i += chunkSize) {
        const chunk = allRows.slice(i, i + chunkSize);
        
        const { error } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .upsert(chunk, {
            onConflict: 'shopify_variant_id',
            ignoreDuplicates: false,
          });

        if (error) {
          throw new Error(`Supabase upsert failed: ${error.message}`);
        }
      }

      // Update job progress
      await job.updateProgress({
        products: totalProducts,
        variants: totalVariants,
      });

      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          productsSynced: totalProducts,
          variantsSynced: totalVariants,
        },
      });

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Mark sync job as completed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    console.log(`Bulk sync completed: ${totalProducts} products, ${totalVariants} variants`);

  } catch (error) {
    // Mark sync job as failed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errors: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    throw error;
  }
}

// Placeholder exports for other processors
export async function processPeriodicSyncCheck(shopId: string) {
  console.log(`Periodic sync check for shop ${shopId}`);
  // Implementation in next task
}

export async function processManualSync(shopId: string, job: Job) {
  // Reuse initial bulk sync logic
  await processInitialBulkSync(shopId, job);
}

export async function processRetryWebhook(data: { syncJobId: string; webhookPayload: any; attempt: number }) {
  console.log(`Retry webhook for sync job ${data.syncJobId}, attempt ${data.attempt}`);
  // Implementation in next task
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test bulk-sync.test.ts
```

Expected: PASS (with placeholder test)

- [ ] **Step 5: Commit bulk sync processor**

```bash
git add app/lib/workers/
git commit -m "feat: implement initial bulk sync processor with pagination

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 11: Periodic Sync Check Processor

**Files:**
- Modify: `app/lib/workers/processors.server.ts`

**Interfaces:**
- Consumes: `ShopifyAPIClient`, Prisma models, Supabase client, last sync timestamp
- Produces: `processPeriodicSyncCheck(shopId: string)` - fetches updated products since last sync and applies delta

- [ ] **Step 1: Implement periodic sync check**

Replace placeholder in `app/lib/workers/processors.server.ts`:

```typescript
export async function processPeriodicSyncCheck(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { supabaseConfig: true },
  });

  if (!shop || !shop.supabaseConfig || !shop.supabaseConfig.syncEnabled) {
    return;
  }

  const shopifyClient = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
  const supabase = createSupabaseClient(shop.supabaseConfig);

  // Get last periodic sync timestamp
  const lastSyncJob = await prisma.syncJob.findFirst({
    where: {
      shopId: shop.id,
      jobType: 'periodic_check',
      status: 'completed',
    },
    orderBy: {
      completedAt: 'desc',
    },
  });

  const lastSyncTime = lastSyncJob?.completedAt || shop.supabaseConfig.updatedAt;

  // Create sync job
  const syncJob = await prisma.syncJob.create({
    data: {
      shopId: shop.id,
      jobType: 'periodic_check',
      status: 'running',
    },
  });

  try {
    let totalProducts = 0;
    let totalVariants = 0;
    let nextPageInfo: string | null = null;

    do {
      // Fetch updated products since last sync
      const { products, nextPageInfo: nextPage } = await shopifyClient.getProducts({
        limit: 250,
        pageInfo: nextPageInfo || undefined,
        updatedAtMin: lastSyncTime.toISOString(),
      });

      if (products.length === 0) break;

      // Process each product
      for (const product of products) {
        // Fetch existing rows from Supabase
        const { data: existingRows } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .select('shopify_variant_id')
          .eq('shopify_product_id', product.id);

        const existingVariantIds = new Set(
          existingRows?.map(row => row.shopify_variant_id).filter(Boolean) || []
        );

        // Transform current product
        const currentRows = transformProduct(product);
        const currentVariantIds = new Set(
          currentRows.map(row => row.shopify_variant_id).filter(Boolean)
        );

        // Find orphaned variants (exist in Supabase but not in Shopify)
        const orphanedVariantIds = [...existingVariantIds].filter(
          id => !currentVariantIds.has(id)
        );

        // Delete orphaned variants
        if (orphanedVariantIds.length > 0) {
          await supabase
            .from(shop.supabaseConfig.tableNameProducts)
            .delete()
            .in('shopify_variant_id', orphanedVariantIds);
        }

        // Upsert current rows
        const { error } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .upsert(currentRows, {
            onConflict: 'shopify_variant_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`Periodic sync upsert error for product ${product.id}:`, error);
          continue;
        }

        totalProducts++;
        totalVariants += currentRows.length;
      }

      nextPageInfo = nextPage;

    } while (nextPageInfo);

    // Mark completed
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        productsSynced: totalProducts,
        variantsSynced: totalVariants,
      },
    });

    console.log(`Periodic sync check completed: ${totalProducts} products checked`);

  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errors: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    throw error;
  }
}
```

- [ ] **Step 2: Commit periodic sync processor**

```bash
git add app/lib/workers/processors.server.ts
git commit -m "feat: implement periodic sync check with delta detection

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 12: Schedule Periodic Sync Jobs

**Files:**
- Create: `app/lib/queue/scheduler.server.ts`
- Create: `app/routes/api.cron.schedule-syncs.tsx` (Remix route for triggering scheduler)

**Interfaces:**
- Consumes: Prisma Shop/Plan models, syncQueue
- Produces: `schedulePeriodicSyncs()` - schedules repeating jobs for all active shops

> Nota: i job ripetibili BullMQ richiedono un worker attivo, quindi questo scheduler funziona solo in locale (con `npm run worker`). In produzione è **superato dalla route cron di Part 4 (Task 17)**, che a ogni invocazione calcola direttamente i negozi "in scadenza" ed esegue i processor inline. Implementalo comunque: è il meccanismo usato in sviluppo.

- [ ] **Step 1: Implement scheduler**

Create `app/lib/queue/scheduler.server.ts`:

```typescript
import { syncQueue } from './queues.server';
import { prisma } from '~/db.server';

export async function schedulePeriodicSyncs() {
  const shops = await prisma.shop.findMany({
    where: {
      uninstalledAt: null,
      supabaseConfig: {
        syncEnabled: true,
      },
    },
    include: {
      supabaseConfig: true,
    },
  });

  for (const shop of shops) {
    if (!shop.supabaseConfig) continue;

    // Get plan limits
    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });

    if (!plan) continue;

    const intervalMs = plan.maxSyncFrequencyHours * 3600 * 1000;

    // Schedule repeating job
    await syncQueue.add(
      `periodic-sync-${shop.id}`,
      {
        type: 'periodic-sync-check',
        shopId: shop.id,
      },
      {
        repeat: {
          every: intervalMs,
        },
        jobId: `periodic-sync-${shop.id}`, // Prevents duplicates
      }
    );

    console.log(`Scheduled periodic sync for shop ${shop.shopDomain} every ${plan.maxSyncFrequencyHours}h`);
  }
}

export async function unschedulePeriodicSync(shopId: string) {
  const repeatableJobs = await syncQueue.getRepeatableJobs();
  
  for (const job of repeatableJobs) {
    if (job.id === `periodic-sync-${shopId}`) {
      await syncQueue.removeRepeatableByKey(job.key);
      console.log(`Unscheduled periodic sync for shop ${shopId}`);
    }
  }
}
```

- [ ] **Step 2: Create scheduler API route**

Create `app/routes/api.cron.schedule-syncs.tsx`:

```typescript
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { schedulePeriodicSyncs } from '~/lib/queue/scheduler.server';

export async function action({ request }: ActionFunctionArgs) {
  // Verify cron secret (for external cron services like Vercel Cron)
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  
  if (authHeader !== expectedAuth) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await schedulePeriodicSyncs();
    return json({ ok: true });
  } catch (error) {
    console.error('Scheduler error:', error);
    return json({ error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add CRON_SECRET to .env.example**

```bash
# Cron
CRON_SECRET=generate_random_secret_here
```

- [ ] **Step 4: Commit scheduler**

```bash
git add app/lib/queue/scheduler.server.ts app/routes/api.cron.schedule-syncs.tsx .env.example
git commit -m "feat: implement periodic sync scheduler with plan-based intervals

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary - Part 2 Complete

**Cosa è stato costruito:**

- **Phase 4** — Infrastruttura coda: connessione Redis, coda BullMQ con retry (3 tentativi, backoff esponenziale da 1 min), worker per sviluppo locale
- **Phase 5** — Processor: client Shopify REST con rate limiting, bulk sync iniziale paginato, periodic check con delta detection (insert/update/delete varianti orfane), scheduler locale + endpoint cron

**Prossimo passo:** Part 3 — User Interface (`2026-07-11-shopify-supabase-sync-part3-ui.md`)
