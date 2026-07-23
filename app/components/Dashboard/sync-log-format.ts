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

// Formatta SEMPRE nel fuso indicato, mai in quello della macchina: cosi' il
// render sul server e l'idratazione sul client producono la stessa stringa
// (niente disallineamento) e il merchant legge l'orario del proprio negozio.
// Fallback UTC se il fuso manca o non e' valido: deterministico comunque.
function formatIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}

export function formatDateTime(iso: string, timeZone?: string | null): string {
  try {
    return formatIn(iso, timeZone || 'UTC');
  } catch {
    // Fuso non riconosciuto dall'ambiente: non deve rompere la pagina.
    return formatIn(iso, 'UTC');
  }
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
