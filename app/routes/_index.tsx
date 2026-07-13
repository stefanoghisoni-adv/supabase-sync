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
import { authenticate } from '~/shopify.server';

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

  const lastSync = recentJobs.find((j) => j.status === 'completed');

  return json({
    shop,
    plan,
    recentJobs,
    stats: {
      supabaseConnected: !!shop.supabaseConfig?.syncEnabled,
      productCount,
      variantCount,
      customFieldsCount,
      lastSyncTime: lastSync?.completedAt ?? null,
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

  // Trigger manual sync (BullMQ signature: add(jobName, data))
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
              customers: 0,
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

          <StatsCard title="Products Synced" value={stats.productCount} />

          <StatsCard title="Variants Synced" value={stats.variantCount} />
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
