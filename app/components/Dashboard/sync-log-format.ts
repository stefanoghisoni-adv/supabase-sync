const TABLE_CREATION_MESSAGES: Record<string, string> = {
  table_create_products: 'Creazione tabella prodotti riuscita',
  table_create_customers: 'Creazione tabella clienti riuscita',
  table_create_both: 'Creazione tabelle prodotti e clienti riuscita',
};

// null se il job non e' un evento di creazione tabelle.
export function tableCreationMessage(jobType: string): string | null {
  return TABLE_CREATION_MESSAGES[jobType] ?? null;
}

export interface StatusBadge {
  tone: 'success' | 'critical' | 'info';
  label: string;
}

export function syncStatusBadge(status: string): StatusBadge {
  if (status === 'completed') return { tone: 'success', label: 'Completata' };
  if (status === 'failed') return { tone: 'critical', label: 'Fallita' };
  return { tone: 'info', label: 'In corso' };
}

// null finche' il job non e' concluso: non c'e' ancora una durata da mostrare.
export function formatDuration(
  startedAt: string,
  completedAt: string | null,
): string | null {
  if (!completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function due(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

// Terza colonna: vuota per le creazioni tabella, altrimenti varianti idonee e —
// solo se il piano li include — i clienti.
export function syncRowNumbers(
  job: { jobType: string; variantsSynced: number; customersSynced: number },
  customersEnabled: boolean,
): string {
  if (tableCreationMessage(job.jobType) !== null) return '';
  const parts = [`${job.variantsSynced} varianti idonee`];
  if (customersEnabled) parts.push(`${job.customersSynced} clienti`);
  return parts.join(' · ');
}
