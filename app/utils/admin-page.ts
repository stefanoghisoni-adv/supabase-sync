// Ricaricare l'app dall'interno non basta: nell'admin l'app vive in un iframe, e
// window.location.reload() ripete la richiesta della URL corrente dell'iframe.
// Dopo una navigazione interna quella URL non e' necessariamente una pagina, e
// il merchant si ritrova davanti una risposta grezza dentro il riquadro
// dell'app. Qui si ricostruisce l'indirizzo della pagina dell'admin che ospita
// l'app, per ricaricare quella.

/** Handle del negozio: e' quello che compare nell'URL dell'admin. */
const STORE_HANDLE = /^[a-z0-9][a-z0-9-]*$/;
/** Client ID pubblico dell'app. */
const API_KEY = /^[a-z0-9]+$/;

export function adminAppUrl(
  shopDomain: string | null | undefined,
  apiKey: string | null | undefined,
): string | null {
  const handle = (shopDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.myshopify\.com$/, '');
  const key = (apiKey ?? '').trim().toLowerCase();

  // Entrambi finiscono dentro un indirizzo su cui si naviga: si accettano solo
  // i caratteri di un handle e di un client ID veri, cosi' un valore sporco non
  // puo' portarsi dietro path, query o un host di qualcun altro.
  if (!STORE_HANDLE.test(handle)) return null;
  if (!API_KEY.test(key)) return null;

  return `https://admin.shopify.com/store/${handle}/apps/${key}`;
}

/** Il minimo che serve di window: cosi' la funzione e' verificabile. */
interface PageWindow {
  open(url: string, target: string): unknown;
  location: { reload(): void };
}

export function reloadWholePage(
  adminUrl: string | null,
  win: PageWindow,
): void {
  if (adminUrl) {
    // _top: si ricarica la pagina dell'admin, quindi anche l'app al suo interno,
    // con i file aggiornati. E' la stessa strada che l'app usa gia' per portare
    // il merchant alla pagina di conferma dell'abbonamento.
    win.open(adminUrl, '_top');
    return;
  }

  // Senza il contesto del negozio non si risale alla pagina dell'admin: resta
  // la ricarica del documento corrente, che e' comunque meglio di niente.
  win.location.reload();
}
