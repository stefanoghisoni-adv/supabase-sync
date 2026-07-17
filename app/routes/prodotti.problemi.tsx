// app/routes/prodotti.problemi.tsx
// Tab dedicata: elenco delle varianti a cui manca cost_per_item (i "prodotti con
// problemi" della dashboard), con link diretto all'admin Shopify per correggere.
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Page,
  Card,
  DataTable,
  Banner,
  Text,
  Link,
  BlockStack,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
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

  const rows: ProblemVariant[] = [];
  let pageInfo: string | undefined;
  let error: string | null = null;

  try {
    do {
      const { products, nextPageInfo } = await client.getProducts({
        limit: 250,
        pageInfo,
        // Solo i campi utili alla tabella e al controllo di readiness.
        fields: 'id,title,variants',
      });
      rows.push(...collectProblemVariants(products ?? []));
      pageInfo = nextPageInfo ?? undefined;
    } while (pageInfo);
  } catch (err) {
    console.error('[prodotti.problemi loader] fetch prodotti fallito:', err);
    error = 'Impossibile recuperare i prodotti da Shopify. Riprova tra poco.';
  }

  return json({ rows, error, shopDomain: shop.shopDomain });
}

export default function ProblemProducts() {
  const { rows, error, shopDomain } = useLoaderData<typeof loader>();

  const tableRows = rows.map((r) => [
    <Link
      key={`p-${r.variantId}`}
      url={`https://${shopDomain}/admin/products/${r.productId}/variants/${r.variantId}`}
      target="_blank"
    >
      {r.productTitle}
    </Link>,
    r.variantTitle,
    r.sku ?? '—',
    <code key={`f-${r.variantId}`}>{r.missingField}</code>,
  ]);

  return (
    <Page title="Prodotti con problemi" backAction={{ url: '/' }}>
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}

        {!error && rows.length === 0 && (
          <Banner tone="success">
            Nessun prodotto con problemi: tutte le varianti hanno il valore{' '}
            <code>cost_per_item</code>.
          </Banner>
        )}

        {rows.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                {rows.length}{' '}
                {rows.length === 1 ? 'variante' : 'varianti'} a cui manca il valore{' '}
                <code>cost_per_item</code>. Clicca sul nome del prodotto per aprirlo
                nell'admin Shopify e correggerlo.
              </Text>
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['Prodotto', 'Variante', 'SKU', 'Campo mancante']}
                rows={tableRows}
              />
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
