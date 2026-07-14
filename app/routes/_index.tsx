import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, Form, useFetcher } from '@remix-run/react';
import { useEffect } from 'react';
import {
  Page,
  Layout,
  BlockStack,
  InlineGrid,
  InlineStack,
  Button,
  Text,
} from '@shopify/polaris';
import { StatsCard } from '~/components/Dashboard/StatsCard';
import { ActivityLog } from '~/components/Dashboard/ActivityLog';
import { PlanBanner } from '~/components/Dashboard/PlanBanner';
import { Stepper, type StepperItem } from '~/components/Dashboard/Stepper';
import { resolveStepStates } from '~/components/Dashboard/stepper-state';
import { prisma } from '~/db.server';
import { syncQueue } from '~/lib/queue/queues.server';
import { authenticate } from '~/shopify.server';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      include: { supabaseConfig: true },
    });

    if (!shop) {
      throw new Response('Shop not found', { status: 404 });
    }

    const plan = await prisma.plan.findUnique({
      where: { planName: shop.currentPlan },
    });

    const recentJobs = await prisma.syncJob.findMany({
      where: { shopId: shop.id },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    const supabaseConnected = !!shop.supabaseConfig?.connectionVerifiedAt;
    const customersEnabled = plan?.customersSyncEnabled ?? false;

    return json({
      shop,
      plan,
      recentJobs,
      supabaseConnected,
      customersEnabled,
    });
  } catch (err) {
    // Le Response (redirect di auth, 404) devono passare intatte.
    if (err instanceof Response) throw err;
    // Il dettaglio completo va SOLO nei log del server: rilanciare il testo
    // grezzo al browser esporrebbe dettagli interni (info-disclosure).
    console.error('[dashboard loader] errore non gestito:', err);
    const isDev = process.env.NODE_ENV !== 'production';
    const detail =
      isDev && err instanceof Error
        ? err.message
        : "Errore interno del server. Controlla i log dell'app per il dettaglio.";
    throw new Response(detail, { status: 500, statusText: 'Errore dashboard' });
  }
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

  // Trigger manual sync (BullMQ signature: add(jobName, data))
  await syncQueue.add('manual-sync', {
    type: 'manual-sync',
    shopId: shop.id,
  });

  return json({ ok: true });
}

interface StatsResponse {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
  customersEnabled: boolean;
  customerCount: number | null;
}

export default function Dashboard() {
  const { shop, plan, recentJobs, supabaseConnected, customersEnabled } =
    useLoaderData<typeof loader>();

  const statsFetcher = useFetcher<StatsResponse>();

  useEffect(() => {
    statsFetcher.load('/api/stats/products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = statsFetcher.data;
  const statsLoading = statsFetcher.state === 'loading' || !stats;

  const steps = resolveStepStates(supabaseConnected);
  const syncTitle = customersEnabled
    ? 'Sincronizza prodotti e clienti'
    : 'Sincronizza prodotti';

  const previewProducts = stats?.totalProducts ?? '…';
  const previewCustomers = stats?.customerCount ?? '…';

  const stepperItems: StepperItem[] = [
    {
      id: 'connect-supabase',
      title: 'Collega Supabase',
      state: steps.connectSupabase,
      content: (
        <BlockStack gap="200">
          <Text as="p" tone="subdued">
            Collega il tuo progetto Supabase per ricevere i dati sincronizzati.
            Le tabelle necessarie verranno create automaticamente in base al tuo
            piano.
          </Text>
          <InlineStack>
            <Button url="/settings/supabase" variant="primary">
              Collega Supabase
            </Button>
          </InlineStack>
        </BlockStack>
      ),
    },
    {
      id: 'sync',
      title: syncTitle,
      state: steps.sync,
      lockedHint:
        'Completa il collegamento a Supabase per sbloccare la sincronizzazione.',
      content: (
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            Sincronizzerai {previewProducts} prodotti da Shopify → tabella{' '}
            <code>products</code> su Supabase
            {customersEnabled
              ? ` e ${previewCustomers} clienti → tabella customers`
              : ''}
            .
          </Text>
          <Form method="post">
            <InlineStack>
              <Button submit variant="primary">
                Avvia sincronizzazione
              </Button>
            </InlineStack>
          </Form>
        </BlockStack>
      ),
    },
  ];

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {plan && (
          <PlanBanner
            shop={shop}
            plan={plan}
            currentUsage={{
              products: stats?.totalProducts ?? 0,
              customers: stats?.customerCount ?? 0,
              customFields: 0,
            }}
          />
        )}

        <InlineGrid columns={{ xs: 1, sm: 2, md: customersEnabled ? 4 : 3 }} gap="400">
          <StatsCard
            title="Prodotti totali"
            value={stats?.totalProducts ?? 0}
            loading={statsLoading}
          />
          <StatsCard
            title="Prodotti pronti"
            value={stats?.readyCount ?? 0}
            status="success"
            loading={statsLoading}
          />
          <StatsCard
            title="Prodotti con problemi"
            value={stats?.problemCount ?? 0}
            status="critical"
            loading={statsLoading}
          />
          {customersEnabled && (
            <StatsCard
              title="Clienti"
              value={stats?.customerCount ?? 0}
              loading={statsLoading}
            />
          )}
        </InlineGrid>

        <Stepper steps={stepperItems} />

        {supabaseConnected && (
          <Layout>
            <Layout.Section>
              <ActivityLog jobs={recentJobs} />
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
