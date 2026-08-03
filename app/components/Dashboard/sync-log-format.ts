const TABLE_CREATION_MESSAGES: Record<string, string> = {
  table_create_products: 'Creazione tabella prodotti riuscita',
  table_create_customers: 'Creazione tabella clienti riuscita',
  table_create_both: 'Creazione tabelle prodotti e clienti riuscita',
};

// null se il job non e' un evento di creazione tabelle.
export function tableCreationMessage(jobType: string): string | null {
  return TABLE_CREATION_MESSAGES[jobType] ?? null;
}

// Il modo in cui il database dice che una tabella non c'e': o non esiste
// davvero, o non e' ancora nella copia dello schema che l'API REST tiene in
// memoria. Per chi legge il log e' la stessa notizia.
const TABLE_MISSING = /could not find the table|does not exist|relation .* does not exist|42P01/i;

/**
 * L'errore di un job come va letto dal merchant.
 *
 * Gli errori arrivano dalle librerie, quindi in inglese e con dentro nomi di
 * tabelle e codici: nel log del negozio non dicono nulla a chi li legge. I casi
 * che sappiamo riconoscere li traduciamo in una frase sola; gli altri passano
 * come sono — meglio un errore tecnico che nessun errore.
 */
export function syncErrorMessage(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return 'Errore sconosciuto';

  if (TABLE_MISSING.test(text)) {
    if (/customer|client/i.test(text)) {
      return 'Non è stata trovata nessuna tabella per i clienti';
    }
    if (/product|prodott/i.test(text)) {
      return 'Non è stata trovata nessuna tabella per i prodotti';
    }
  }

  return text;
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
