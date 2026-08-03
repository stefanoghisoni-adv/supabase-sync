// app/components/Dashboard/SyncLog.tsx
import { Card, BlockStack, Text, Badge, DataTable, Button } from '@shopify/polaris';
import type { SerializeFrom } from '@remix-run/node';
import type { SyncJob } from '@prisma/client';
import { useState } from 'react';
import {
  tableCreationMessage,
  syncStatusBadge,
  formatDateTime,
  syncErrorMessage,
} from './sync-log-format';
import { SyncJobDetailsModal } from './SyncJobDetailsModal';

type SerializedSyncJob = SerializeFrom<SyncJob>;

interface SyncLogProps {
  jobs: SerializedSyncJob[];
  customersEnabled: boolean;
  timeZone: string | null;
}

export function SyncLog({ jobs, customersEnabled, timeZone }: SyncLogProps) {
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null);

  const detailsJob = detailsJobId ? jobs.find((j) => j.id === detailsJobId) : null;

  const rows = jobs.map((job) => {
    const creation = tableCreationMessage(job.jobType);
    const status = syncStatusBadge(job.status);

    // Per la creazione tabelle il badge porta il messaggio completo; per le sync
    // porta lo stato, con l'eventuale errore sotto.
    const stateCell = creation ? (
      <Badge tone="success">{creation}</Badge>
    ) : (
      // inlineAlign="start": senza, il BlockStack allarga il badge a tutta la
      // cella (i figli di un flex column si estendono per default), mentre deve
      // essere largo quanto il suo testo.
      <BlockStack gap="100" inlineAlign="start">
        <Badge tone={status.tone}>{status.label}</Badge>
        {job.status === 'failed' && job.errors ? (
          <Text as="span" variant="bodySm" tone="critical">
            {syncErrorMessage((job.errors as { message?: string }).message)}
          </Text>
        ) : null}
      </BlockStack>
    );

    // Terza colonna: vuota per le creazioni tabella, altrimenti pulsante "Vedi
    // dettagli" che apre il modal.
    const detailsCell = creation ? (
      ''
    ) : (
      <Button variant="plain" onClick={() => setDetailsJobId(job.id)}>
        Vedi dettagli
      </Button>
    );

    // Solo data e ora: quanto e' durata la corsa non dice nulla al merchant.
    return [stateCell, formatDateTime(job.startedAt, timeZone), detailsCell];
  });

  return (
    <>
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
              headings={['Stato', 'Data/ora', 'Dettagli']}
              rows={rows}
            />
          )}
        </BlockStack>
      </Card>

      {detailsJob && (
        <SyncJobDetailsModal
          open={!!detailsJobId}
          onClose={() => setDetailsJobId(null)}
          jobId={detailsJob.id}
          jobStartedAt={detailsJob.startedAt}
          timeZone={timeZone}
          customersEnabled={customersEnabled}
        />
      )}
    </>
  );
}
