import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useActionData, Form, useSubmit, useNavigation } from '@remix-run/react';
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
  Modal,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import {
  getReadProxyTokenForDisplay,
  issueReadProxyToken,
} from '~/lib/read-proxy/token.server';

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

  // Le letture di tracciamento non passano più dalla anon key del merchant ma
  // dal proxy dell'owner, che applica il gate sullo stato del negozio. Quindi
  // qui mostriamo URL del proxy + token, non la anon key. La service_role NON
  // viene mai restituita al client (troppo sensibile).
  const readToken = getReadProxyTokenForDisplay({
    readProxyTokenEnc: shop?.readProxyTokenEnc ?? null,
  });
  const proxyBaseUrl = process.env.SHOPIFY_APP_URL ?? '';

  return json({
    config: {
      url: config.supabaseUrl,
      projectRef: config.supabaseProjectRef ?? null,
      readToken,
      proxyBaseUrl,
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

  // Il form della sincronizzazione non invia `intent`, quindi non finisce qui.
  if (formData.get('intent') === 'regenerate-read-token') {
    await issueReadProxyToken(shop.id);
    return json({
      success:
        'Chiave di lettura rigenerata. Aggiorna la configurazione in Stape/GTM: la chiave precedente non è più valida.',
    });
  }

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
  const [showRegenerate, setShowRegenerate] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();
  const regenerating =
    navigation.state !== 'idle' &&
    navigation.formData?.get('intent') === 'regenerate-read-token';

  const regenerate = () => {
    submit({ intent: 'regenerate-read-token' }, { method: 'post' });
    setShowRegenerate(false);
  };

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
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Lettura dei dati (Stape / GTM server-side)
                    </Text>
                    <CopyableField
                      label="URL di lettura"
                      value={config.proxyBaseUrl}
                    />
                    <CopyableField
                      label="Chiave di lettura"
                      value={config.readToken ?? ''}
                    />
                    <Text as="p" tone="subdued">
                      Nel tuo tool di tracciamento imposta <code>projectUrl</code> con
                      l&apos;URL di lettura e <code>apiKey</code> con la chiave di
                      lettura. Nome tabella e condizioni restano invariati.
                    </Text>
                    {!config.readToken && (
                      <Banner tone="warning">
                        Chiave di lettura non ancora generata. Usa
                        &laquo;Rigenera chiave di lettura&raquo; per crearne una.
                      </Banner>
                    )}
                    <InlineStack align="start">
                      <Button
                        tone="critical"
                        loading={regenerating}
                        onClick={() => setShowRegenerate(true)}
                      >
                        Rigenera chiave di lettura
                      </Button>
                    </InlineStack>
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

                <Modal
                  open={showRegenerate}
                  onClose={() => setShowRegenerate(false)}
                  title="Rigenerare la chiave di lettura?"
                  primaryAction={{
                    content: 'Rigenera',
                    destructive: true,
                    onAction: regenerate,
                    loading: regenerating,
                  }}
                  secondaryActions={[
                    {
                      content: 'Annulla',
                      onAction: () => setShowRegenerate(false),
                      disabled: regenerating,
                    },
                  ]}
                >
                  <Modal.Section>
                    {/* "entro ~30 secondi" e non "subito": il proxy tiene in
                        cache lo stato per token con TTL 30s, quindi la chiave
                        vecchia può restare valida fino allo scadere. */}
                    <Text as="p">
                      La chiave attuale smetterà di funzionare{' '}
                      <strong>entro ~30 secondi</strong>. Il tracciamento resterà
                      senza dati finché non incolli la nuova chiave in Stape/GTM.
                    </Text>
                  </Modal.Section>
                </Modal>
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
