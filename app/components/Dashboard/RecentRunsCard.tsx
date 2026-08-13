import { Card, BlockStack, InlineStack, Text, Badge, Button, Divider } from '@shopify/polaris';
import { recentRunRows, type RecentRunInput } from './recent-runs';
import { formatDateTime } from './sync-log-format';
import { useNavLoading } from './nav-loading';

const LOGS_PATH = '/logs';

export interface RecentRunsCardProps {
  runs: RecentRunInput[];
  timeZone: string | null;
}

/**
 * Le ultime corse, accanto al grafico.
 *
 * Non e' il registro in miniatura: niente errori per esteso, niente dettaglio,
 * niente colonne. Serve a rispondere a una domanda sola — "sta girando?" — e
 * chi vuole il resto ha il pulsante per la pagina che lo mostra.
 */
export function RecentRunsCard({ runs, timeZone }: RecentRunsCardProps) {
  const rows = recentRunRows(runs);
  // Stesso comportamento degli altri pulsanti-link della dashboard: mentre Remix
  // carica /logs il pulsante mostra lo spinner e si disabilita.
  const logs = useNavLoading(LOGS_PATH);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
          <Text as="h2" variant="headingMd">
            Ultime sincronizzazioni
          </Text>
          {rows.length > 0 && (
            <Button
              variant="plain"
              url={LOGS_PATH}
              onClick={logs.start}
              disabled={logs.loading}
              loading={logs.loading}
            >
              Vedi tutte
            </Button>
          )}
        </InlineStack>

        {rows.length === 0 ? (
          <Text as="p" tone="subdued">
            Nessuna sincronizzazione ancora.
          </Text>
        ) : (
          <BlockStack gap="200">
            {rows.map((row, index) => (
              <BlockStack gap="200" key={row.id}>
                {/* Righe separate da una linea, non da una tabella: le colonne
                    qui sarebbero due, e una tabella di due colonne e' una lista
                    con piu' cornice del necessario. */}
                {index > 0 && <Divider />}
                <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd">
                      {row.label}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {formatDateTime(row.startedAt, timeZone)}
                    </Text>
                  </BlockStack>
                  <Badge tone={row.badge.tone}>{row.badge.label}</Badge>
                </InlineStack>
              </BlockStack>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
