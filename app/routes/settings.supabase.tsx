import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useActionData, Form } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Checkbox,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Box,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { supabaseConfig: true },
  });

  const config = shop?.supabaseConfig;
  if (!config) {
    return json({ config: null });
  }

  // Public key (anon) e URL sono informazioni pubbliche: le mostriamo in chiaro.
  // La service_role key NON viene mai restituita al client (troppo sensibile).
  let publicKey = '';
  try {
    publicKey = decrypt(config.supabasePublicKey);
  } catch {
    publicKey = '';
  }

  return json({
    config: {
      url: config.supabaseUrl,
      publicKey,
      projectRef: config.supabaseProjectRef ?? null,
      syncEnabled: config.syncEnabled,
      syncIntervalHours: config.syncIntervalHours,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { supabaseConfig: true },
  });

  if (!shop?.supabaseConfig) {
    return json(
      { error: 'Nessun progetto Supabase collegato. Collega Supabase dalla Dashboard.' },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const syncEnabled = formData.get('syncEnabled') === 'on';

  // Aggiorniamo SOLO le preferenze di sync: le chiavi restano quelle salvate
  // durante il collegamento OAuth e non vengono mai sovrascritte da qui.
  await prisma.supabaseConfig.update({
    where: { shopId: shop.id },
    data: { syncEnabled },
  });

  return json({ success: 'Impostazioni salvate.' });
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <BlockStack gap="100">
      <Text as="span" variant="headingSm">
        {label}
      </Text>
      {/* flex:1 + minWidth:0 + ellipsis: i due campi hanno la STESSA larghezza; i
          valori lunghi (anon key) sono troncati con "…" a fine riga, ma il pulsante
          copia sempre il valore intero. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          title={value}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--p-color-bg-surface-secondary)',
            border: '1px solid var(--p-color-border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontFamily: 'var(--p-font-family-mono, monospace)',
            fontSize: 13,
            color: 'var(--p-color-text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </div>
        <Button onClick={copy} disabled={!value}>
          {copied ? 'Copiato' : 'Copia'}
        </Button>
      </div>
    </BlockStack>
  );
}

export default function SupabaseSettings() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const successMessage =
    actionData && 'success' in actionData ? actionData.success : undefined;
  const errorMessage =
    actionData && 'error' in actionData ? actionData.error : undefined;

  const [syncEnabled, setSyncEnabled] = useState(config?.syncEnabled ?? false);

  return (
    <Page title="Impostazioni Supabase" backAction={{ url: '/' }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {successMessage && <Banner tone="success">{successMessage}</Banner>}
            {errorMessage && <Banner tone="critical">{errorMessage}</Banner>}

            {!config ? (
              <Banner tone="info">
                Nessun progetto Supabase collegato. Vai nella Dashboard per collegare
                Supabase.
              </Banner>
            ) : (
              <>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Progetto collegato
                    </Text>
                    {config.projectRef && (
                      <Text as="p" tone="subdued">
                        Riferimento progetto: <code>{config.projectRef}</code>
                      </Text>
                    )}
                    <CopyableField label="URL del progetto" value={config.url} />
                    <CopyableField label="Public key (anon)" value={config.publicKey} />
                    <Box
                      background="bg-surface-secondary"
                      borderRadius="200"
                      padding="300"
                    >
                      <Text as="p" tone="subdued">
                        🔒 La <strong>service role key</strong> è salvata cifrata e
                        gestita in modo sicuro dall'app: per motivi di sicurezza non
                        viene mostrata.
                      </Text>
                    </Box>
                  </BlockStack>
                </Card>

                <Card>
                  <Form method="post">
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Sincronizzazione
                      </Text>
                      <Checkbox
                        label="Sincronizzazione automatica attiva"
                        checked={syncEnabled}
                        onChange={setSyncEnabled}
                        name="syncEnabled"
                      />
                      <InlineStack align="end">
                        <Button variant="primary" submit>
                          Salva impostazioni
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                </Card>
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
