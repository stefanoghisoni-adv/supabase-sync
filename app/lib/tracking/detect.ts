/**
 * Riconoscimento delle fonti di tracciamento gia' presenti sul negozio.
 *
 * A cosa serve: gli eventi (visualizzazione prodotto, aggiunta al carrello,
 * acquisto) devono partire da un posto solo. Se un canale di vendita invia il
 * suo acquisto e ne parte un altro dal tag manager del merchant, le conversioni
 * si contano due volte e i dati non tornano piu' — e la colpa cade sull'ultima
 * cosa installata.
 *
 * Cosa NON fa, ed e' la parte importante: non puo' concludere che un negozio sia
 * pulito. I pixel personalizzati creati in Impostazioni → Eventi cliente non
 * sono leggibili da nessuna app, ed e' proprio li' che finisce buona parte del
 * tracciamento di oggi. Per questo l'esito e' sempre un elenco di cio' che si e'
 * trovato, mai un'assoluzione.
 */

/** Fonte di eventi trovata sul negozio. */
export interface TrackingFinding {
  /** 'channel' = canale di vendita collegato; 'theme' = codice nel tema. */
  kind: 'channel' | 'theme';
  /** Nome leggibile: "Meta", "Google Analytics 4", … */
  name: string;
  /** Dove si trova: nome del canale o percorso del file. */
  where: string;
}

// Canali di vendita che portano con se' un proprio tracciamento. Il confronto e'
// su frammenti minuscoli perche' Shopify traduce i nomi visibili: l'italiano
// "Facebook e Instagram" e l'inglese "Facebook & Instagram" devono cadere
// entrambi nella stessa voce.
const TRACKING_CHANNELS: { match: string[]; name: string }[] = [
  { match: ['facebook', 'instagram', 'meta'], name: 'Meta' },
  { match: ['google', 'youtube'], name: 'Google' },
  { match: ['tiktok'], name: 'TikTok' },
  { match: ['pinterest'], name: 'Pinterest' },
  { match: ['snapchat'], name: 'Snapchat' },
  { match: ['microsoft', 'bing'], name: 'Microsoft Advertising' },
];

/**
 * Canali collegati che inviano eventi per conto proprio.
 *
 * Il Negozio online, il Punto vendita e Shop non compaiono: non portano un
 * tracciamento di terze parti e segnalarli sarebbe rumore.
 */
export function detectTrackingChannels(
  publications: { name: string }[],
): TrackingFinding[] {
  const found: TrackingFinding[] = [];

  for (const publication of publications) {
    const haystack = publication.name.toLowerCase();
    const channel = TRACKING_CHANNELS.find((candidate) =>
      candidate.match.some((fragment) => haystack.includes(fragment)),
    );
    // Un canale per voce: "Facebook e Instagram" e' una fonte sola, non due.
    if (channel && !found.some((f) => f.name === channel.name)) {
      found.push({ kind: 'channel', name: channel.name, where: publication.name });
    }
  }

  return found;
}

// Impronte del codice di tracciamento incollato nel tema. Si cercano gli
// indirizzi da cui gli script vengono caricati e le funzioni con cui gli eventi
// vengono inviati: il primo prende l'installazione fatta col copia-incolla, il
// secondo anche chi ha riscritto il caricamento a modo suo.
const THEME_SIGNATURES: { name: string; patterns: RegExp[] }[] = [
  {
    name: 'Google Tag Manager',
    patterns: [/googletagmanager\.com\/gtm\.js/i, /\bGTM-[A-Z0-9]{4,}/],
  },
  {
    name: 'Google Analytics 4',
    // gtag.js e' condiviso con Google Ads: a distinguerlo e' l'identificativo,
    // che per GA4 comincia per G-. Senza questo, ogni negozio con Google Ads
    // risulterebbe avere GA4.
    patterns: [/googletagmanager\.com\/gtag\/js/i, /\bG-[A-Z0-9]{6,}/],
  },
  {
    name: 'Meta Pixel',
    patterns: [/connect\.facebook\.net/i, /\bfbq\s*\(/],
  },
  {
    name: 'TikTok Pixel',
    patterns: [/analytics\.tiktok\.com/i, /\bttq\.(load|track)\s*\(/],
  },
  {
    name: 'Google Ads',
    patterns: [/\bAW-[0-9]{6,}/],
  },
];

/**
 * Codice di tracciamento dentro un file del tema.
 *
 * I commenti Liquid vengono tolti prima di cercare: un frammento lasciato
 * commentato non invia niente, e segnalarlo manderebbe il merchant a cercare un
 * problema che non ha.
 */
export function detectThemeTracking(
  files: { filename: string; content: string }[],
): TrackingFinding[] {
  const found: TrackingFinding[] = [];

  for (const file of files) {
    const code = stripLiquidComments(file.content);
    for (const signature of THEME_SIGNATURES) {
      if (!signature.patterns.some((pattern) => pattern.test(code))) continue;
      // Lo stesso strumento puo' comparire in piu' file: il merchant deve
      // sapere che c'e', non quante volte e' stato incollato.
      if (found.some((f) => f.name === signature.name)) continue;
      found.push({ kind: 'theme', name: signature.name, where: file.filename });
    }
  }

  return found;
}

/** Rimuove i commenti Liquid `{% comment %}…{% endcomment %}`. */
function stripLiquidComments(content: string): string {
  return content.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gi, '');
}

/**
 * I file del tema che vale la pena leggere.
 *
 * Il codice di tracciamento si incolla nel layout, ed e' li' che sta quasi
 * sempre; ma chi ha fatto un lavoro ordinato lo ha messo in uno snippet
 * richiamato dal layout. Leggere l'intero tema costerebbe molto e non
 * aggiungerebbe quasi nulla: le sezioni e i template non sono posti dove un
 * tag di tracciamento globale viene messo.
 */
export function themeFilesToInspect(filenames: string[]): string[] {
  return filenames.filter(
    (name) => /^layout\/.+\.liquid$/i.test(name) || /^snippets\/.+\.liquid$/i.test(name),
  );
}
