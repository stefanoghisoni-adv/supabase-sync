// app/routes/prodotti.problemi.tsx
// Tab dedicata: elenco delle varianti a cui manca cost_per_item, con campo
// editabile che scrive il costo direttamente su Shopify (via inventory_items).
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useState } from 'react';
import {
  Page,
  Card,
  Box,
  IndexTable,
  Banner,
  Text,
  Link,
  Badge,
  Spinner,
  TextField,
  InlineStack,
  BlockStack,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { isAuthorized } from '~/utils/authorization.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import type { ShopifyProduct } from '~/types/shopify';
import { enrichVariantCosts } from '~/lib/stats/inventory-cost.server';
import {
  collectProblemVariants,
  type ProblemVariant,
} from '~/lib/stats/product-readiness';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  const allProducts: ShopifyProduct[] = [];
  let pageInfo: string | undefined;
  let error: string | null = null;

  try {
    do {
      const { products, nextPageInfo } = await client.getProducts({
        limit: 250,
        pageInfo,
        fields: 'id,title,variants',
      });
      allProducts.push(...(products ?? []));
      pageInfo = nextPageInfo ?? undefined;
    } while (pageInfo);

    // Popola il costo reale dagli InventoryItem prima di individuare i "problemi".
    await enrichVariantCosts(client, allProducts);
  } catch (err) {
    console.error('[prodotti.problemi loader] fetch prodotti fallito:', err);
    error = 'Impossibile recuperare i prodotti da Shopify. Riprova tra poco.';
  }

  const rows = error ? [] : collectProblemVariants(allProducts);

  return json({
    rows,
    error,
    shopDomain: shop.shopDomain,
    blocked: !isAuthorized(shop.authorization),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    return json({ ok: false, error: 'Negozio non trovato.' }, { status: 404 });
  }
  // Enforcement server-side: nessuna scrittura se il negozio non è ENABLED.
  if (!isAuthorized(shop.authorization)) {
    return json(
      { ok: false, error: "L'utilizzo dell'app è sospeso per questo negozio." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    inventoryItemId?: number | string;
    cost?: string;
  };

  const inventoryItemId = Number(body.inventoryItemId);
  const cost = String(body.cost ?? '').trim().replace(',', '.');
  const parsed = Number(cost);

  if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0) {
    return json({ ok: false, error: 'Variante non valida.' }, { status: 400 });
  }
  if (cost === '' || !Number.isFinite(parsed) || parsed < 0) {
    return json({ ok: false, error: 'Inserisci un costo valido (≥ 0).' }, { status: 400 });
  }

  try {
    const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
    await client.updateInventoryItemCost(inventoryItemId, cost);
    return json({ ok: true, inventoryItemId });
  } catch (err) {
    console.error('[prodotti.problemi action] update cost fallito:', err);
    return json(
      { ok: false, error: 'Salvataggio su Shopify non riuscito. Riprova.' },
      { status: 502 },
    );
  }
}

function CostRow({
  row,
  index,
  shopDomain,
  blocked,
}: {
  row: ProblemVariant;
  index: number;
  shopDomain: string;
  blocked: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const saving = fetcher.state !== 'idle';
  const saved = fetcher.data?.ok === true;
  const serverError =
    fetcher.data && fetcher.data.ok === false ? fetcher.data.error : null;

  const trySave = () => {
    const normalized = value.trim().replace(',', '.');
    if (normalized === '') return; // campo vuoto: non salvare
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) {
      setLocalError('Costo non valido');
      return;
    }
    if (!row.inventoryItemId) {
      setLocalError('Variante senza inventory item');
      return;
    }
    setLocalError(null);
    fetcher.submit(
      { inventoryItemId: row.inventoryItemId, cost: normalized },
      { method: 'post', encType: 'application/json' },
    );
  };

  return (
    <IndexTable.Row id={String(row.variantId)} position={index}>
      <IndexTable.Cell>
        <Link
          url={`https://${shopDomain}/admin/products/${row.productId}/variants/${row.variantId}`}
          target="_blank"
        >
          {row.productTitle}
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{row.variantTitle}</IndexTable.Cell>
      <IndexTable.Cell>{row.sku ?? '—'}</IndexTable.Cell>
      <IndexTable.Cell>
        {saved ? (
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">
              {value}
            </Text>
            <Badge tone="success">Salvato</Badge>
          </InlineStack>
        ) : (
          // onKeyDown a livello di wrapper: Invio conferma il salvataggio
          // (Polaris TextField non espone direttamente l'evento tastiera).
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                trySave();
              }
            }}
          >
            <TextField
              label="cost_per_item"
              labelHidden
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              value={value}
              onChange={(v) => {
                setValue(v);
                setLocalError(null);
              }}
              onBlur={trySave}
              placeholder="0.00"
              autoComplete="off"
              disabled={saving || blocked}
              error={localError ?? serverError ?? undefined}
              connectedRight={
                saving ? (
                  <Spinner accessibilityLabel="Salvataggio" size="small" />
                ) : undefined
              }
            />
          </div>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}

export default function ProblemProducts() {
  const { rows, error, shopDomain, blocked } = useLoaderData<typeof loader>();

  return (
    <Page title="Prodotti con problemi" backAction={{ url: '/' }}>
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}

        {blocked && !error && (
          <Banner tone="warning">
            L'app è sospesa per questo negozio: puoi consultare l'elenco ma non
            modificare i costi finché non viene riattivata.
          </Banner>
        )}

        {!error && rows.length === 0 && (
          <Banner tone="success">
            Nessun prodotto con problemi: tutte le varianti hanno il valore{' '}
            <code>cost_per_item</code>.
          </Banner>
        )}

        {rows.length > 0 && (
          <Card padding="0">
            <Box padding="400">
              <Text as="p" tone="subdued">
                {rows.length}{' '}
                {rows.length === 1 ? 'variante' : 'varianti'} a cui manca il valore{' '}
                <code>cost_per_item</code>. Inserisci il costo e premi Invio (o
                esci dal campo): viene salvato direttamente su Shopify.
              </Text>
            </Box>
            <IndexTable
              resourceName={{ singular: 'variante', plural: 'varianti' }}
              itemCount={rows.length}
              selectable={false}
              headings={[
                { title: 'Prodotto' },
                { title: 'Variante' },
                { title: 'SKU' },
                { title: 'cost_per_item' },
              ]}
            >
              {rows.map((r, i) => (
                <CostRow
                  key={r.variantId}
                  row={r}
                  index={i}
                  shopDomain={shopDomain}
                  blocked={blocked}
                />
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
