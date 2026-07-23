// app/components/Dashboard/SyncLog.tsx
import { Card, BlockStack, Text, Badge, DataTable } from '@shopify/polaris';
import type { SerializeFrom } from '@remix-run/node';
import type { SyncJob } from '@prisma/client';
import {
  tableCreationMessage,
  syncStatusBadge,
  formatDuration,
  formatDateTime,
  syncRowNumbers,
} from './sync-log-format';

type SerializedSyncJob = SerializeFrom<SyncJob>;

interface SyncLogProps {
  jobs: SerializedSyncJob[];
  customersEnabled: boolean;
  timeZone: string | null;
}

export function SyncLog({ jobs, customersEnabled, timeZone }: SyncLogProps) {
  const rows = jobs.map((job) => {
    const creation = tableCreationMessage(job.jobType);
    const status = syncStatusBadge(job.status);

    // Per la creazione tabelle il badge porta il messaggio completo; per le sync
    // porta lo stato, con l'eventuale errore sotto.
    const stateCell = creation ? (
      <Badge tone="success">{creation}</Badge>
    ) : (
      <BlockStack gap="100">
        <Badge tone={status.tone}>{status.label}</Badge>
        {job.status === 'failed' && job.errors ? (
          <Text as="span" variant="bodySm" tone="critical">
            {(job.errors as { message?: string }).message ?? 'Errore sconosciuto'}
          </Text>
        ) : null}
      </BlockStack>
    );

    const duration = formatDuration(job.startedAt, job.completedAt);
    const when = duration
      ? `${formatDateTime(job.startedAt, timeZone)} · ${duration}`
      : formatDateTime(job.startedAt, timeZone);

    return [stateCell, when, syncRowNumbers(job, customersEnabled)];
  });

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Log di sincronizzazione
        </Text>
        {jobs.length === 0 ? (
          <Text as="p" tone="subdued">
            Nessuna attività registrata
          </Text>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text']}
            headings={['Stato', 'Data/ora', 'Prodotti e clienti']}
            rows={rows}
          />
        )}
      </BlockStack>
    </Card>
  );
}
