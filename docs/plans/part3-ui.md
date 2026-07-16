# Shopify-Supabase Sync App Implementation Plan - Part 3: User Interface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la UI embedded nell'admin Shopify con componenti Polaris React per configurazione, monitoraggio e gestione

**This document:** Part 3 of 4 - User Interface (Dashboard, Settings, History, Billing UI)

**Prerequisites:** Part 1 completata (✅ 7/7 task) e Part 2 completata

**Tech Stack:** Remix, Shopify Polaris React ^13 (già installato in Part 1), Shopify App Bridge

## Global Constraints

Vincoli validi per ogni task di questo documento (ogni task li eredita implicitamente):

- Node.js >= 18, TypeScript strict mode, Shopify API version `2024-01`
- Vincolo di progetto: **costi ZERO** — Vercel Free (app + cron), Supabase Free (PostgreSQL metadata app), Upstash Free (Redis per BullMQ)
- Polaris: versione **^13.9.5** (già in `package.json` da Part 1 — non reinstallare a versione 12)
- Autenticazione: ogni loader/action delle pagine embedded usa `await authenticate.admin(request)` da `~/shopify.server`; il dominio shop è `session.shop`
- Gestione errori nelle action: shop non trovato → `json({ error: 'Shop not found' }, { status: 404 })`; errori runtime → `console.error` + `json({ error: message }, { status: 500 })`
- Nota stack a costo zero: il "Sync Now" del dashboard accoda un job BullMQ su Upstash; in produzione il job viene processato dalla route cron di Part 4 al giro successivo (non c'è worker long-running)
- **Nomi già implementati in Part 1 — usare esattamente questi:**
  - Prisma (singleton `prisma` da `app/db.server.ts`): `Shop.shopDomain`, `Shop.currentPlan` (String), `SupabaseConfig.supabasePublicKey`, `SupabaseConfig.supabaseServiceRoleKey`, `SupabaseConfig.tableNameProducts`, `SupabaseConfig.tableNameCustomers`, `Plan.planName`, `Plan.priceMonthly`/`Plan.priceYearly`
  - Funzioni: `encrypt(plaintext)`/`decrypt(ciphertext)` in `app/utils/crypto.server.ts`, `createSupabaseClient(config)` in `app/lib/supabase.server.ts`; coda `syncQueue` da `app/lib/queue/queues.server.ts` (Part 2) — firma BullMQ: `syncQueue.add(nomeJob, data)`

---

## Phase 6: Core UI Pages

### Task 13: Dashboard Page

**Files:**
- Modify: `app/routes/_index.tsx` (sostituisce la route placeholder creata in Part 1)
- Create: `app/components/Dashboard/StatsCard.tsx`
- Create: `app/components/Dashboard/ActivityLog.tsx`
- Create: `app/components/Dashboard/PlanBanner.tsx`

**Interfaces:**
- Consumes: Prisma Shop model, SyncJob records
- Produces: Dashboard route with stats cards, activity log, sync button

- [ ] **Step 1: Install App Bridge React** (Polaris ^13.9.5 è già installato da Part 1)

```bash
npm install @shopify/app-bridge-react
```

- [ ] **Step 2: Create stats card component**

Create `app/components/Dashboard/StatsCard.tsx`:

```tsx
import { Card, Text, BlockStack } from '@shopify/polaris';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  status?: 'success' | 'warning' | 'critical';
}

export function StatsCard({ title, value, icon, status }: StatsCardProps) {
  return (
    <Card>
      <BlockStack gap="200">
        {icon}
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        <Text as="p" variant="heading2xl" tone={status}>
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 3: Create activity log component**

Create `app/components/Dashboard/ActivityLog.tsx`:

```tsx
import { Card, Badge, Text, BlockStack, InlineStack } from '@shopify/polaris';
import type { SyncJob } from '@prisma/client';

interface ActivityLogProps {
  jobs: SyncJob[];
}

export function ActivityLog({ jobs }: ActivityLogProps) {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Recent Activity
        </Text>
        
        {jobs.length === 0 ? (
          <Text as="p" tone="subdued">
            No sync activity yet
          </Text>
        ) : (
          <BlockStack gap="300">
            {jobs.map((job) => (
              <InlineStack key={job.id} align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge
                      tone={
                        job.status === 'completed' ? 'success' :
                        job.status === 'failed' ? 'critical' :
                        job.status === 'running' ? 'info' : 'warning'
                      }
                    >
                      {job.status}
                    </Badge>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {job.jobType.replace('_', ' ')}
                    </Text>
                  </InlineStack>
                  
                  {job.status === 'completed' && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {job.productsSynced} products, {job.variantsSynced} variants
                    </Text>
                  )}
                  
                  {job.status === 'failed' && job.errors && (
                    <Text as="span" variant="bodySm" tone="critical">
                      {(job.errors as any).message}
                    </Text>
                  )}
                </BlockStack>
                
                <Text as="span" variant="bodySm" tone="subdued">
                  {formatRelativeTime(job.startedAt)}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

- [ ] **Step 4: Create plan usage banner**

Create `app/components/Dashboard/PlanBanner.tsx`:

```tsx
import { Banner, InlineStack, Button } from '@shopify/polaris';
import type { Shop, Plan } from '@prisma/client';

interface PlanBannerProps {
  shop: Shop;
  plan: Plan;
  currentUsage: {
    products: number;
    customers: number;
    customFields: number;
  };
}

export function PlanBanner({ shop, plan, currentUsage }: PlanBannerProps) {
  if (!plan.maxProducts) return null; // Unlimited plan
  
  const productUsagePercent = (currentUsage.products / plan.maxProducts) * 100;
  
  if (productUsagePercent < 80) return null; // Don't show until 80%
  
  return (
    <Banner
      tone={productUsagePercent >= 95 ? 'critical' : 'warning'}
      onDismiss={() => {}}
    >
      <InlineStack align="space-between" blockAlign="center">
        <div>
          You're using {currentUsage.products}/{plan.maxProducts} products ({productUsagePercent.toFixed(0)}%)
          <br />
          Upgrade to {plan.planName === 'free' ? 'Pro' : 'Business'} to sync more products.
        </div>
        <Button url="/billing">View Plans</Button>
      </InlineStack>
    </Banner>
  );
}
```

- [ ] **Step 5: Implement dashboard route**

Sostituisci il contenuto di `app/routes/_index.tsx` con:

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, Form } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineGrid,
  Text,
} from '@shopify/polaris';
import { StatsCard } from '~/components/Dashboard/StatsCard';
import { ActivityLog } from '~/components/Dashboard/ActivityLog';
import { PlanBanner } from '~/components/Dashboard/PlanBanner';
import { prisma } from '~/db.server';
import { createSupabaseClient } from '~/lib/supabase.server';
import { syncQueue } from '~/lib/queue/queues.server';
import { authenticate } from '~/shopify.server'; // Shopify app auth (from template)

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      supabaseConfig: true,
    },
  });
  
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }
  
  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });
  
  // Get recent sync jobs
  const recentJobs = await prisma.syncJob.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });
  
  // Get usage stats
  let productCount = 0;
  let variantCount = 0;
  
  if (shop.supabaseConfig) {
    const supabase = createSupabaseClient(shop.supabaseConfig);
    
    const { count: prodCount } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .select('*', { count: 'exact', head: true })
      .eq('is_variant', false);
    
    const { count: varCount } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .select('*', { count: 'exact', head: true });
    
    productCount = prodCount || 0;
    variantCount = varCount || 0;
  }
  
  const customFieldsCount = await prisma.customField.count({
    where: { shopId: shop.id },
  });
  
  const lastSync = recentJobs.find(j => j.status === 'completed');
  
  return json({
    shop,
    plan,
    recentJobs,
    stats: {
      supabaseConnected: !!shop.supabaseConfig?.syncEnabled,
      productCount,
      variantCount,
      customFieldsCount,
      lastSyncTime: lastSync?.completedAt,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });
  
  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }
  
  // Trigger manual sync (firma BullMQ: add(nomeJob, data))
  await syncQueue.add('manual-sync', {
    type: 'manual-sync',
    shopId: shop.id,
  });
  
  return json({ ok: true });
}

export default function Dashboard() {
  const { shop, plan, recentJobs, stats } = useLoaderData<typeof loader>();
  
  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {plan && (
          <PlanBanner
            shop={shop}
            plan={plan}
            currentUsage={{
              products: stats.productCount,
              customers: 0, // TODO: customer count
              customFields: stats.customFieldsCount,
            }}
          />
        )}
        
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
          <StatsCard
            title="Supabase Status"
            value={stats.supabaseConnected ? 'Connected' : 'Not Configured'}
            status={stats.supabaseConnected ? 'success' : 'warning'}
          />
          
          <StatsCard
            title="Products Synced"
            value={stats.productCount}
          />
          
          <StatsCard
            title="Variants Synced"
            value={stats.variantCount}
          />
        </InlineGrid>
        
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Sync Controls
                </Text>
                
                {stats.lastSyncTime && (
                  <Text as="p" tone="subdued">
                    Last sync: {new Date(stats.lastSyncTime).toLocaleString()}
                  </Text>
                )}
                
                <Form method="post">
                  <Button
                    variant="primary"
                    size="large"
                    submit
                    disabled={!stats.supabaseConnected}
                  >
                    Sync Now
                  </Button>
                </Form>
                
                {!stats.supabaseConnected && (
                  <Text as="p" tone="subdued">
                    Configure Supabase to enable sync
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section>
            <ActivityLog jobs={recentJobs} />
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
```

- [ ] **Step 6: Commit dashboard page**

```bash
git add app/routes/_index.tsx app/components/Dashboard/ package.json
git commit -m "feat: implement dashboard page with stats and activity log

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 14: Supabase Configuration Page

**Files:**
- Create: `app/routes/settings.supabase.tsx`
- Create: `app/routes/api.supabase.test-connection.tsx`
- Create: `app/routes/api.supabase.create-tables.tsx`

**Interfaces:**
- Consumes: Prisma SupabaseConfig model, encryption utils
- Produces: Configuration form with test connection and auto-create tables

- [ ] **Step 1: Create test connection API**

Create `app/routes/api.supabase.test-connection.tsx`:

```tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { createClient } from '@supabase/supabase-js';

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const { url, serviceRoleKey } = body;
  
  try {
    const supabase = createClient(url, serviceRoleKey);
    
    // Test connection by listing tables
    const { data, error } = await supabase
      .from('_prisma_migrations') // Internal Supabase table
      .select('*', { count: 'exact', head: true });
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = table not found (ok)
      throw error;
    }
    
    return json({ ok: true, message: 'Connection successful' });
    
  } catch (error: any) {
    return json(
      { ok: false, message: error.message || 'Connection failed' },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: Create tables API**

Create `app/routes/api.supabase.create-tables.tsx`:

```tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { createClient } from '@supabase/supabase-js';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';

const PRODUCTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id BIGINT NOT NULL,
  shopify_variant_id BIGINT UNIQUE,
  is_variant BOOLEAN DEFAULT true,
  product_title TEXT NOT NULL,
  product_description TEXT,
  vendor TEXT,
  product_type TEXT,
  handle TEXT,
  product_status TEXT,
  tags TEXT[],
  product_published_at TIMESTAMP,
  variant_title TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(10, 2) NOT NULL,
  compare_at_price NUMERIC(10, 2),
  cost_per_item NUMERIC(10, 2),
  position INTEGER,
  inventory_quantity INTEGER,
  weight NUMERIC(10, 3),
  weight_unit TEXT,
  requires_shipping BOOLEAN,
  taxable BOOLEAN,
  image_url TEXT,
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_variant 
  ON products(shopify_variant_id) 
  WHERE shopify_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(product_status);
`;

const CUSTOMERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id BIGINT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  accepts_marketing BOOLEAN,
  marketing_opt_in_level TEXT,
  total_spent NUMERIC(10, 2),
  orders_count INTEGER,
  customer_state TEXT,
  tags TEXT[],
  note TEXT,
  verified_email BOOLEAN,
  tax_exempt BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify_id ON customers(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
`;

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true },
  });
  
  if (!shop?.supabaseConfig) {
    return json({ error: 'Supabase not configured' }, { status: 400 });
  }
  
  try {
    const supabase = createClient(
      shop.supabaseConfig.supabaseUrl,
      decrypt(shop.supabaseConfig.supabaseServiceRoleKey)
    );
    
    // Execute SQL via Supabase RPC or direct query
    // Note: Supabase JS client doesn't expose .query() directly
    // Use REST API instead
    
    const response = await fetch(
      `${shop.supabaseConfig.supabaseUrl}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          'apikey': decrypt(shop.supabaseConfig.supabaseServiceRoleKey),
          'Authorization': `Bearer ${decrypt(shop.supabaseConfig.supabaseServiceRoleKey)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL,
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to create tables');
    }
    
    return json({ ok: true, message: 'Tables created successfully' });
    
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Implement configuration page**

Create `app/routes/settings.supabase.tsx`:

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useLoaderData, useActionData, Form } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Banner,
  BlockStack,
  ChoiceList,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true },
  });
  
  return json({ config: shop?.supabaseConfig });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  const formData = await request.formData();
  const action = formData.get('_action');
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });
  
  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }
  
  if (action === 'save') {
    const url = formData.get('url') as string;
    const publicKey = formData.get('publicKey') as string;
    const serviceKey = formData.get('serviceKey') as string;
    const syncEnabled = formData.get('syncEnabled') === 'on';
    const syncInterval = parseInt(formData.get('syncInterval') as string);
    
    await prisma.supabaseConfig.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        supabaseUrl: url,
        supabasePublicKey: encrypt(publicKey),
        supabaseServiceRoleKey: encrypt(serviceKey),
        syncEnabled,
        syncIntervalHours: syncInterval,
      },
      update: {
        supabaseUrl: url,
        supabasePublicKey: encrypt(publicKey),
        supabaseServiceRoleKey: encrypt(serviceKey),
        syncEnabled,
        syncIntervalHours: syncInterval,
      },
    });
    
    return json({ success: 'Configuration saved' });
  }
  
  return json({ error: 'Invalid action' }, { status: 400 });
}

export default function SupabaseSettings() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  
  const [url, setUrl] = useState(config?.supabaseUrl || '');
  const [publicKey, setPublicKey] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(config?.syncEnabled || false);
  const [syncInterval, setSyncInterval] = useState<string[]>([
    String(config?.syncIntervalHours || 24),
  ]);
  
  return (
    <Page
      title="Supabase Configuration"
      backAction={{ url: '/' }}
    >
      <Layout>
        <Layout.Section>
          {actionData?.success && (
            <Banner tone="success">{actionData.success}</Banner>
          )}
          {actionData?.error && (
            <Banner tone="critical">{actionData.error}</Banner>
          )}
          
          <Card>
            <Form method="post">
              <input type="hidden" name="_action" value="save" />
              
              <FormLayout>
                <TextField
                  label="Supabase Project URL"
                  value={url}
                  onChange={setUrl}
                  name="url"
                  placeholder="https://xxxxx.supabase.co"
                  autoComplete="off"
                  requiredIndicator
                />
                
                <TextField
                  label="Supabase Public Key (anon)"
                  value={publicKey}
                  onChange={setPublicKey}
                  name="publicKey"
                  type="password"
                  autoComplete="off"
                  requiredIndicator
                />
                
                <TextField
                  label="Supabase Service Role Key"
                  value={serviceKey}
                  onChange={setServiceKey}
                  name="serviceKey"
                  type="password"
                  autoComplete="off"
                  helpText="This key grants full database access. We encrypt it before saving."
                  requiredIndicator
                />
                
                <Checkbox
                  label="Enable automatic sync"
                  checked={syncEnabled}
                  onChange={setSyncEnabled}
                  name="syncEnabled"
                />
                
                <ChoiceList
                  title="Sync interval"
                  choices={[
                    { label: 'Every 24 hours', value: '24' },
                    { label: 'Every 6 hours (Pro+)', value: '6', disabled: true },
                    { label: 'Every 1 hour (Business+)', value: '1', disabled: true },
                    { label: 'Every 30 minutes (Enterprise)', value: '0.5', disabled: true },
                  ]}
                  selected={syncInterval}
                  onChange={setSyncInterval}
                  name="syncInterval"
                />
                
                <BlockStack gap="300">
                  <Button variant="primary" submit>
                    Save Configuration
                  </Button>
                  
                  <Button variant="plain">
                    Test Connection
                  </Button>
                </BlockStack>
              </FormLayout>
            </Form>
          </Card>
          
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Create Tables
              </Text>
              <Text as="p" tone="subdued">
                After saving your configuration, create the required tables in your Supabase database.
              </Text>
              <Button>
                Create Tables in Supabase
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

- [ ] **Step 4: Commit Supabase settings**

```bash
git add app/routes/settings.supabase.tsx app/routes/api.supabase.*
git commit -m "feat: implement Supabase configuration page with test connection

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary - Part 3

Questo documento copre Dashboard (Task 13) e Configurazione Supabase (Task 14).

**Pagine rimandate deliberatamente** — non hanno task in questo piano; prima di implementarle va scritto un piano dedicato con codice completo. Requisiti esatti (dalla spec di design, sez. UI):

- **Field Mapping** (`app/routes/settings.fields.tsx` + `app/routes/api.fields.tsx`): checkbox per i campi opzionali Shopify (`metafields`, `fulfillment_service`, `inventory_management`, `image_urls`) salvate in `FieldMapping`; modal "Add Custom Field" (nome snake_case, tipo text/number/boolean/date, applies_to product/customer, default opzionale) che inserisce in `CustomField` ed esegue `ALTER TABLE ... ADD COLUMN` sul Supabase del merchant; limite campi da `Plan.customFieldsLimit` (free 3, pro 10, business 50, enterprise illimitati); delete con conferma che droppa la colonna
- **Sync History** (`app/routes/sync.history.tsx`): Polaris DataTable sui `SyncJob` con filtri stato/tipo/periodo, paginazione 20 righe, modal dettaglio con `errors` JSONB e bottone "Retry Now" (riaccoda il job), export CSV
- **Customers** (`app/routes/customers.tsx`): se `Plan.customersSyncEnabled === false` mostra paywall con confronto piani; altrimenti toggle sync clienti, contatore `customersSynced / Plan.maxCustomers`, bottone "Sync Customers Now", tabella clienti recenti
- **Billing** (`app/routes/billing.tsx`): tabella comparativa 4 piani (prezzi da `Plan.priceMonthly`/`priceYearly`: 0, 29/290, 99/990, 299/2990), meter di utilizzo prodotti/clienti/campi custom, bottoni upgrade che chiamano l'action di `billing.upgrade` (Part 4, Task 16)

**Prossimo passo:** Part 4 — OAuth, Billing API e deployment a costo zero (`2026-07-11-shopify-supabase-sync-part4-deploy.md`)
