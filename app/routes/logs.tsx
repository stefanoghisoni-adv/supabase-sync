import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Layout, Box } from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { SyncLog } from '~/components/Dashboard/SyncLog';
import { findPlanByName } from '~/lib/billing/find-plan.server';
import { useNavLoading } from '~/components/Dashboard/nav-loading';
import { ProductOverflowBanner } from '~/components/Dashboard/ProductOverflowBanner';

// Quanti eventi mostrare: la tabella resta una lista unica senza paginazione,
// quindi teniamo il tetto a 20 righe per non allungarla a dismisura.
const MAX_JOBS = 20;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return json({ jobs: [], customersEnabled: false, timeZone: null });
  }

  const [plan, jobs] = await Promise.all([
    findPlanByName(shop.currentPlan),
    prisma.syncJob.findMany({
      where: { shopId: shop.id },
      orderBy: { startedAt: 'desc' },
      take: MAX_JOBS,
    }),
  ]);

  return json({
    jobs,
    customersEnabled: plan?.customersSyncEnabled ?? false,
    timeZone: shop.ianaTimezone,
  });
}

export default function Logs() {
  const { jobs, customersEnabled, timeZone } = useLoaderData<typeof loader>();

  // Spinner e disabilitazione solo se e' stato questo pulsante a far partire
  // la navigazione: dal menu laterale dell'admin deve restare fermo.
  const settings = useNavLoading('/settings/supabase');

  return (
    <Page
      title="Logs"
      backAction={{ url: '/' }}
      secondaryActions={[
        {
          content: 'Impostazioni',
          icon: SettingsIcon,
          url: '/settings/supabase',
          accessibilityLabel: 'Impostazioni',
          onAction: settings.start,
          disabled: settings.loading,
          loading: settings.loading,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          {/* Il tetto raggiunto si vede anche qui: chi guarda il registro sta
              cercando di capire perche' un prodotto non e' arrivato, ed e'
              esattamente la risposta. */}
          <Box paddingBlockEnd="400">
            <ProductOverflowBanner />
          </Box>
          <SyncLog jobs={jobs} customersEnabled={customersEnabled} timeZone={timeZone} />
        </Layout.Section>
      </Layout>
      {/* Respiro in fondo: senza, il bordo della card tocca il fondo dell'iframe. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
