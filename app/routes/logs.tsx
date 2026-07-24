import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useNavigation } from '@remix-run/react';
import { Page, Layout } from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { SyncLog } from '~/components/Dashboard/SyncLog';

// Quanti eventi mostrare: la dashboard ne teneva 10 perche' il log le stava
// accanto; qui la pagina e' dedicata, quindi si guarda piu' indietro.
const MAX_JOBS = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return json({ jobs: [], customersEnabled: false, timeZone: null });
  }

  const [plan, jobs] = await Promise.all([
    prisma.plan.findUnique({ where: { planName: shop.currentPlan } }),
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

  // Stesso comportamento della dashboard: mentre Remix carica /settings/supabase
  // il pulsante mostra lo spinner e si disabilita.
  const navigation = useNavigation();
  const loadingSettings =
    navigation.state === 'loading' &&
    navigation.location?.pathname === '/settings/supabase';

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
          disabled: loadingSettings,
          loading: loadingSettings,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <SyncLog jobs={jobs} customersEnabled={customersEnabled} timeZone={timeZone} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
