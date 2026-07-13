import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useActionData, useFetcher, Form } from '@remix-run/react';
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
import { validateSupabaseUrl } from '~/utils/supabase-url.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true },
  });

  return json({ config: shop?.supabaseConfig ?? null });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const formData = await request.formData();
  const intent = formData.get('_action');

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }

  if (intent === 'save') {
    const rawUrl = formData.get('url') as string;
    const urlCheck = validateSupabaseUrl(rawUrl);
    if (!urlCheck.ok) {
      return json({ error: urlCheck.error }, { status: 400 });
    }
    const url = urlCheck.url!;
    const publicKey = formData.get('publicKey') as string;
    const serviceKey = formData.get('serviceKey') as string;
    const syncEnabled = formData.get('syncEnabled') === 'on';
    const parsedInterval = parseInt(formData.get('syncInterval') as string, 10);
    const syncInterval = Number.isFinite(parsedInterval) && parsedInterval > 0
      ? parsedInterval
      : 24;

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

  const successMessage =
    actionData && 'success' in actionData ? actionData.success : undefined;
  const errorMessage =
    actionData && 'error' in actionData ? actionData.error : undefined;

  const [url, setUrl] = useState(config?.supabaseUrl || '');
  const [publicKey, setPublicKey] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(config?.syncEnabled || false);
  const [syncInterval, setSyncInterval] = useState<string[]>([
    String(config?.syncIntervalHours || 24),
  ]);

  const testFetcher = useFetcher<{ ok: boolean; message: string }>();
  const createTablesFetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();

  const testConnection = () => {
    testFetcher.submit(
      { url, serviceRoleKey: serviceKey },
      {
        method: 'post',
        action: '/api/supabase/test-connection',
        encType: 'application/json',
      }
    );
  };

  const createTables = () => {
    createTablesFetcher.submit(
      {},
      { method: 'post', action: '/api/supabase/create-tables' }
    );
  };

  const testResult = testFetcher.data;
  const createResult = createTablesFetcher.data;

  return (
    <Page title="Supabase Configuration" backAction={{ url: '/' }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {successMessage && <Banner tone="success">{successMessage}</Banner>}
            {errorMessage && <Banner tone="critical">{errorMessage}</Banner>}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Non hai un account Supabase?
                </Text>
                <Text as="p" tone="subdued">
                  Iscriviti gratuitamente e crea un progetto per sincronizzare i tuoi dati.
                </Text>
                <Button
                  url="https://supabase.com/sign-up"
                  target="_blank"
                >
                  Crea account Supabase
                </Button>
              </BlockStack>
            </Card>

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
                    <Button
                      onClick={testConnection}
                      loading={testFetcher.state !== 'idle'}
                      disabled={!url || !serviceKey}
                    >
                      Test Connection
                    </Button>
                    {testResult && (
                      <Banner tone={testResult.ok ? 'success' : 'critical'}>
                        {testResult.message}
                      </Banner>
                    )}
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
                <Button
                  onClick={createTables}
                  loading={createTablesFetcher.state !== 'idle'}
                >
                  Create Tables in Supabase
                </Button>
                {createResult && (
                  <Banner tone={createResult.error ? 'critical' : 'success'}>
                    {createResult.error || createResult.message || 'Done'}
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
