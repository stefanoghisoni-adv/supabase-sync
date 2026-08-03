// Modal che mostra i dettagli di una sincronizzazione: prodotti e clienti
// aggiunti, rimossi, aggiornati o sospesi. Le tabelle sono in sola lettura, niente
// azioni: chi apre il modal vuole vedere cosa è successo, non modificarlo.

import {
  Modal,
  Tabs,
  IndexTable,
  Badge,
  Text,
  Banner,
  SkeletonBodyText,
  BlockStack,
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { formatDateTime } from './sync-log-format';
import {
  detailBadge,
  productSummary,
  customerSummary,
  truncationNotice,
  visibleTabs,
} from './sync-details-format';

// Contratto dell'endpoint /api/sync-job/:id/details. Ripetuto qui invece di
// importare i tipi dalla route: quel file e' server-side, e importarlo da un
// componente trascinerebbe Prisma nel bundle del browser.
interface SyncDetailRow {
  id: string;
  action: 'added' | 'removed' | 'updated' | 'suspended';
  label: string;
  sublabel: string | null;
  shopifyId: string | null;
  variantId: string | null;
}

interface SyncJobDetailsResponse {
  products: {
    rows: SyncDetailRow[];
    added: number;
    removed: number;
    truncated: boolean;
  };
  customers: {
    rows: SyncDetailRow[];
    added: number;
    updated: number;
    suspended: number;
    truncated: boolean;
  };
  customersEnabled: boolean;
}

interface SyncJobDetailsModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobStartedAt: string;
  timeZone: string | null;
  customersEnabled: boolean;
}

export function SyncJobDetailsModal({
  open,
  onClose,
  jobId,
  jobStartedAt,
  timeZone,
  customersEnabled,
}: SyncJobDetailsModalProps) {
  const fetcher = useFetcher<SyncJobDetailsResponse>();
  const [selectedTab, setSelectedTab] = useState(0);

  // Carica i dettagli solo quando il modal viene aperto, non precaricare.
  useEffect(() => {
    if (open && fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(`/api/sync-job/${jobId}/details`);
    }
  }, [open, jobId, fetcher]);

  // Se il modal si chiude, resetta la tab selezionata per la prossima apertura.
  useEffect(() => {
    if (!open) {
      setSelectedTab(0);
    }
  }, [open]);

  const loading = fetcher.state === 'loading' || (!fetcher.data && open);
  const error = fetcher.data && 'error' in fetcher.data;
  const data = fetcher.data && !error ? (fetcher.data as SyncJobDetailsResponse) : null;

  // Le tab da mostrare: sempre Prodotti, Clienti solo se customersEnabled è true.
  const tabs = visibleTabs(data?.customersEnabled ?? customersEnabled);
  const tabsConfig = [
    { id: 'products', content: 'Prodotti' },
    ...(tabs.includes('customers') ? [{ id: 'customers', content: 'Clienti' }] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dettaglio sincronizzazione"
      secondaryActions={[{ content: 'Chiudi', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd" tone="subdued">
            {formatDateTime(jobStartedAt, timeZone)}
          </Text>

          {loading && <SkeletonBodyText lines={5} />}

          {error && (
            <Banner tone="critical">
              Non è stato possibile caricare i dettagli di questa sincronizzazione.
            </Banner>
          )}

          {data && !loading && !error && (
            <Tabs tabs={tabsConfig} selected={selectedTab} onSelect={setSelectedTab}>
              {selectedTab === 0 && (
                <ProductsTab
                  rows={data.products.rows}
                  added={data.products.added}
                  removed={data.products.removed}
                  truncated={data.products.truncated}
                />
              )}
              {selectedTab === 1 && tabs.includes('customers') && (
                <CustomersTab
                  rows={data.customers.rows}
                  added={data.customers.added}
                  updated={data.customers.updated}
                  suspended={data.customers.suspended}
                  truncated={data.customers.truncated}
                />
              )}
            </Tabs>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

interface ProductsTabProps {
  rows: SyncDetailRow[];
  added: number;
  removed: number;
  truncated: boolean;
}

function ProductsTab({ rows, added, removed, truncated }: ProductsTabProps) {
  const summary = productSummary(added, removed);
  const notice = truncationNotice(truncated);

  // Riga di testo e non EmptyState: quel componente pretende un'illustrazione, e
  // senza immagine mostrerebbe il segnaposto di una figura mancante. Qui poi il
  // vuoto non e' un vicolo cieco da illustrare, e' solo una corsa senza novita'.
  if (rows.length === 0) {
    return (
      <Text as="p" tone="subdued">
        Nessun dettaglio registrato per questa sincronizzazione.
      </Text>
    );
  }

  return (
    <BlockStack gap="300">
      {summary && (
        <Text as="p" variant="bodyMd">
          {summary}
        </Text>
      )}
      <IndexTable
        selectable={false}
        headings={[
          { title: 'Azione' },
          { title: 'Nome' },
          { title: 'ID Shopify' },
        ]}
        itemCount={rows.length}
      >
        {rows.map((row, index) => {
          const badge = detailBadge(row.action);
          return (
            <IndexTable.Row id={row.id} key={row.id} position={index}>
              <IndexTable.Cell>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <BlockStack gap="050">
                  <Text as="span" variant="bodyMd">
                    {row.label}
                  </Text>
                  {row.sublabel && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {row.sublabel}
                    </Text>
                  )}
                </BlockStack>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm" tone="subdued">
                  {row.shopifyId ?? '—'}
                </Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          );
        })}
      </IndexTable>
      {notice && (
        <Text as="p" variant="bodySm" tone="subdued">
          {notice}
        </Text>
      )}
    </BlockStack>
  );
}

interface CustomersTabProps {
  rows: SyncDetailRow[];
  added: number;
  updated: number;
  suspended: number;
  truncated: boolean;
}

function CustomersTab({ rows, added, updated, suspended, truncated }: CustomersTabProps) {
  const summary = customerSummary(added, updated, suspended);
  const notice = truncationNotice(truncated);

  // Riga di testo e non EmptyState: quel componente pretende un'illustrazione, e
  // senza immagine mostrerebbe il segnaposto di una figura mancante. Qui poi il
  // vuoto non e' un vicolo cieco da illustrare, e' solo una corsa senza novita'.
  if (rows.length === 0) {
    return (
      <Text as="p" tone="subdued">
        Nessun dettaglio registrato per questa sincronizzazione.
      </Text>
    );
  }

  return (
    <BlockStack gap="300">
      {summary && (
        <Text as="p" variant="bodyMd">
          {summary}
        </Text>
      )}
      <IndexTable
        selectable={false}
        headings={[
          { title: 'Azione' },
          { title: 'Nome' },
          { title: 'ID Shopify' },
        ]}
        itemCount={rows.length}
      >
        {rows.map((row, index) => {
          const badge = detailBadge(row.action);
          return (
            <IndexTable.Row id={row.id} key={row.id} position={index}>
              <IndexTable.Cell>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodyMd">
                  {row.label}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span" variant="bodySm" tone="subdued">
                  {row.shopifyId ?? '—'}
                </Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          );
        })}
      </IndexTable>
      {notice && (
        <Text as="p" variant="bodySm" tone="subdued">
          {notice}
        </Text>
      )}
    </BlockStack>
  );
}
