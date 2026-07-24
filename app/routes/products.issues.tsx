// app/routes/products.issues.tsx
// Tab dedicata: varianti a cui manca cost_per_item, con campo editabile che scrive
// il costo su Shopify E su Supabase; tic verde a riga salvata; pulsante globale
// "Ricontrolla" che rimuove le varianti risolte e aggiorna il conteggio.
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useCallback, useEffect, useState } from 'react';
import {
  Page,
  Card,
  Box,
  IndexTable,
  Banner,
  Text,
  Link,
  Icon,
  Spinner,
  TextField,
  InlineStack,
  BlockStack,
  Pagination,
} from '@shopify/polaris';
import { CheckCircleIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { isAuthorized } from '~/utils/authorization.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { createSupabaseClient } from '~/lib/supabase.server';
import type { ShopifyProduct } from '~/types/shopify';
import {
  enrichVariantCosts,
  getMissingCostInventoryIds,
} from '~/lib/stats/inventory-cost.server';
import { getReadinessCache, setReadinessCache } from '~/lib/cache/stats-cache.server';
import {
  collectProblemVariants,
  type ProblemVariant,
} from '~/lib/stats/product-readiness';
import { filterProblemVariants, pageCount, pageSlice } from '~/lib/stats/problem-filter';

const PER_PAGE = 20;

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
    console.error('[products.issues loader] fetch prodotti fallito:', err);
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
    include: { supabaseConfig: true },
  });
  if (!shop) {
    return json({ ok: false, error: 'Negozio non trovato.' }, { status: 404 });
  }
  if (!isAuthorized(shop.authorization)) {
    return json(
      { ok: false, error: "L'utilizzo dell'app è sospeso per questo negozio." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    intent?: string;
    variantId?: number | string;
    inventoryItemId?: number | string;
    inventoryItemIds?: number[];
    cost?: string;
  };

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  // --- Re-check mirato: quali varianti hanno ANCORA il costo mancante ---
  if (body.intent === 'recheck') {
    const ids = (body.inventoryItemIds ?? [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
    try {
      const stillProblematic = await getMissingCostInventoryIds(client, ids);

      // Aggiorna SUBITO la cache readiness della Dashboard: ogni variante risolta
      // passa da "problema" a "pronta". Così, tornando in Dashboard, il conteggio
      // è già corretto senza attendere il ricalcolo live.
      const resolved = ids.length - stillProblematic.length;
      if (resolved > 0) {
        const cached = await getReadinessCache(shop.id);
        if (cached) {
          await setReadinessCache(shop.id, {
            totalProducts: cached.totalProducts,
            readyCount: cached.readyCount + resolved,
            problemCount: Math.max(0, cached.problemCount - resolved),
          });
        }
      }

      return json({ ok: true, stillProblematic });
    } catch (err) {
      console.error('[products.issues recheck] fallito:', err);
      return json(
        { ok: false, error: 'Ricontrollo non riuscito. Riprova.' },
        { status: 502 },
      );
    }
  }

  // --- Salvataggio del cost_per_item su Shopify + Supabase ---
  const variantId = Number(body.variantId);
  const inventoryItemId = Number(body.inventoryItemId);
  const cost = String(body.cost ?? '').trim().replace(',', '.');
  const parsed = Number(cost);

  if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0) {
    return json({ ok: false, error: 'Variante non valida.' }, { status: 400 });
  }
  if (cost === '' || !Number.isFinite(parsed) || parsed < 0) {
    return json({ ok: false, error: 'Inserisci un costo valido (≥ 0).' }, { status: 400 });
  }

  // 1) Shopify (fonte di verità del cost_per_item, sull'InventoryItem)
  try {
    await client.updateInventoryItemCost(inventoryItemId, cost);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('[products.issues save] update Shopify fallito:', err);
    // 401/403 = permesso mancante: lo scope write_inventory non è stato ancora
    // concesso dal merchant (serve riautorizzare l'app dopo l'aggiunta dello scope).
    const permission = /\b(401|403)\b/.test(msg);
    return json(
      {
        ok: false,
        error: permission
          ? "L'app non ha il permesso di modificare i costi su Shopify. Riapri/reinstalla l'app per concedere l'autorizzazione, poi riprova."
          : 'Salvataggio su Shopify non riuscito. Riprova.',
      },
      { status: 502 },
    );
  }

  // 2) Supabase (se collegato): allinea subito la riga, senza attendere la sync
  if (shop.supabaseConfig?.connectionVerifiedAt && Number.isInteger(variantId)) {
    try {
      const supabase = createSupabaseClient(shop.supabaseConfig);
      const { error: sbError } = await supabase
        .from(shop.supabaseConfig.tableNameProducts)
        .update({ cost_per_item: parsed })
        .eq('shopify_variant_id', variantId);
      if (sbError) throw sbError;
    } catch (err) {
      console.error('[products.issues save] update Supabase fallito:', err);
      return json(
        {
          ok: false,
          error:
            'Costo salvato su Shopify ma non su Supabase. Riprova per allineare i dati.',
        },
        { status: 502 },
      );
    }
  }

  return json({ ok: true });
}

function CostRow({
  row,
  index,
  shopDomain,
  blocked,
  value,
  onChangeValue,
  saved,
  onSaved,
}: {
  row: ProblemVariant;
  index: number;
  shopDomain: string;
  blocked: boolean;
  value: string;
  onChangeValue: (variantId: number, value: string) => void;
  saved: boolean;
  onSaved: (variantId: number) => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [localError, setLocalError] = useState<string | null>(null);

  const saving = fetcher.state !== 'idle';
  const serverError =
    fetcher.data && fetcher.data.ok === false ? fetcher.data.error : null;

  // Notifica il parent quando il salvataggio va a buon fine (tic verde + stato).
  useEffect(() => {
    if (fetcher.data?.ok === true) onSaved(row.variantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const trySave = () => {
    if (saved) return;
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
      {
        variantId: row.variantId,
        inventoryItemId: row.inventoryItemId,
        cost: normalized,
      },
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
      <IndexTable.Cell>{row.price ?? '—'}</IndexTable.Cell>
      <IndexTable.Cell>
        <div
          style={{ maxWidth: 120 }}
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
              onChangeValue(row.variantId, v);
              setLocalError(null);
            }}
            onBlur={trySave}
            placeholder="0.00"
            autoComplete="off"
            disabled={saving || blocked || saved}
            error={localError ?? serverError ?? undefined}
            connectedRight={
              saving ? (
                <Spinner accessibilityLabel="Salvataggio" size="small" />
              ) : undefined
            }
          />
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {saved && (
          <span aria-label="Salvato" title="Salvato su Shopify e Supabase">
            <Icon source={CheckCircleIcon} tone="success" />
          </span>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}

export default function ProblemProducts() {
  const loaderData = useLoaderData<typeof loader>();
  const { error, shopDomain, blocked } = loaderData;

  const [rows, setRows] = useState<ProblemVariant[]>(loaderData.rows);
  const [values, setValues] = useState<Record<number, string>>({});
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [removedCount, setRemovedCount] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = filterProblemVariants(rows, query);
  const totalPages = pageCount(filtered.length, PER_PAGE);
  const visibleRows = pageSlice(filtered, page, PER_PAGE);

  // Cambiando la ricerca si riparte da pagina 1: restare a pagina 4 su un
  // risultato di 2 pagine mostrerebbe una tabella vuota senza spiegazione.
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Le righe risolte vengono rimosse dall'elenco: se cosi' la pagina corrente
  // resta oltre la fine, si arretra.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const recheckFetcher = useFetcher<{
    ok?: boolean;
    stillProblematic?: number[];
    error?: string;
  }>();
  const rechecking = recheckFetcher.state !== 'idle';

  const onChangeValue = useCallback((variantId: number, value: string) => {
    setValues((prev) => ({ ...prev, [variantId]: value }));
  }, []);

  const onSaved = useCallback((variantId: number) => {
    setSavedIds((prev) => {
      if (prev.has(variantId)) return prev;
      const next = new Set(prev);
      next.add(variantId);
      return next;
    });
  }, []);

  // Il pulsante globale è attivo solo se almeno un valore differisce dall'iniziale
  // (le righe partono vuote) — o è già stato salvato qualcosa.
  const hasChanges =
    savedIds.size > 0 ||
    Object.values(values).some((v) => v.trim() !== '');

  const runRecheck = () => {
    setRemovedCount(0);
    const inventoryItemIds = rows
      .map((r) => r.inventoryItemId)
      .filter((x): x is number => x != null);
    recheckFetcher.submit(
      { intent: 'recheck', inventoryItemIds },
      { method: 'post', encType: 'application/json' },
    );
  };

  // Esito re-check: tieni solo le varianti ancora problematiche; le risolte
  // spariscono dalla tabella (e il conteggio in Dashboard si aggiorna al ritorno).
  useEffect(() => {
    const data = recheckFetcher.data;
    if (!data?.ok || !data.stillProblematic) return;
    const still = new Set(data.stillProblematic);
    setRows((prev) => {
      const kept = prev.filter(
        (r) => r.inventoryItemId == null || still.has(r.inventoryItemId),
      );
      setRemovedCount(prev.length - kept.length);
      const keptIds = new Set(kept.map((r) => r.variantId));
      // Ripulisci gli stati collegati alle righe rimosse.
      setValues((v) => {
        const next: Record<number, string> = {};
        for (const id of keptIds) if (v[id] !== undefined) next[id] = v[id];
        return next;
      });
      setSavedIds((s) => new Set([...s].filter((id) => keptIds.has(id))));
      return kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheckFetcher.data]);

  return (
    <Page
      title="Prodotti con problemi"
      backAction={{ url: '/' }}
      primaryAction={{
        content: 'Ricontrolla e aggiorna',
        onAction: runRecheck,
        loading: rechecking,
        disabled: !hasChanges || blocked,
      }}
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}

        {blocked && !error && (
          <Banner tone="warning">
            L'app è sospesa per questo negozio: puoi consultare l'elenco ma non
            modificare i costi finché non viene riattivata.
          </Banner>
        )}

        {recheckFetcher.data?.ok === false && (
          <Banner tone="critical">{recheckFetcher.data.error}</Banner>
        )}

        {removedCount > 0 && (
          <Banner tone="success" onDismiss={() => setRemovedCount(0)}>
            {removedCount}{' '}
            {removedCount === 1 ? 'variante risolta e rimossa' : 'varianti risolte e rimosse'}{' '}
            dall'elenco. Il conteggio in Dashboard è aggiornato.
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
              <BlockStack gap="300">
                <TextField
                  label="Cerca"
                  labelHidden
                  value={query}
                  onChange={setQuery}
                  autoComplete="off"
                  placeholder="Cerca per titolo, variante, SKU, ID prodotto o prezzo"
                  clearButton
                  onClearButtonClick={() => setQuery('')}
                />
                {/* Con una ricerca senza risultati il conteggio direbbe "0
                    varianti a cui manca il valore...", che si legge come "non ci
                    sono problemi" mentre e' solo la ricerca a non aver trovato
                    nulla. Meglio dirlo esplicitamente. */}
                {query.trim() && filtered.length === 0 ? (
                  <Text as="p" tone="subdued">
                    Nessun risultato per &laquo;{query.trim()}&raquo;. Le varianti
                    con problemi sono {rows.length}: prova a modificare la ricerca.
                  </Text>
                ) : (
                  <Text as="p" tone="subdued">
                    {filtered.length}{' '}
                    {filtered.length === 1 ? 'variante' : 'varianti'} a cui manca il valore{' '}
                    <code>cost_per_item</code>. Inserisci il costo e premi Invio (o
                    esci dal campo): viene salvato su Shopify e Supabase.
                  </Text>
                )}
              </BlockStack>
            </Box>
            <IndexTable
              resourceName={{ singular: 'variante', plural: 'varianti' }}
              itemCount={visibleRows.length}
              selectable={false}
              headings={[
                { title: 'Prodotto' },
                { title: 'Variante' },
                { title: 'SKU' },
                { title: 'Prezzo' },
                { title: 'cost_per_item' },
                { title: '' },
              ]}
            >
              {visibleRows.map((r, i) => (
                <CostRow
                  key={r.variantId}
                  row={r}
                  index={i}
                  shopDomain={shopDomain}
                  blocked={blocked}
                  value={values[r.variantId] ?? ''}
                  onChangeValue={onChangeValue}
                  saved={savedIds.has(r.variantId)}
                  onSaved={onSaved}
                />
              ))}
            </IndexTable>
            {totalPages > 1 && (
              <Box padding="400">
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => setPage((p) => p - 1)}
                    hasNext={page < totalPages}
                    onNext={() => setPage((p) => p + 1)}
                    label={`Pagina ${page} di ${totalPages}`}
                  />
                </InlineStack>
              </Box>
            )}
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
