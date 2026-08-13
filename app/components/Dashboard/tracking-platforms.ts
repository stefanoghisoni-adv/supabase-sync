/**
 * Le piattaforme verso cui un negozio manda dati, raccolte per categoria.
 *
 * Serve al passo che chiede se il merchant ha gia' un'infrastruttura server
 * side: le spunte dicono per cosa gli servirebbe, e quella risposta vale piu'
 * della domanda secca.
 *
 * L'elenco e' scritto qui e non nel database: sono nomi di prodotti altrui, non
 * dati del negozio, e cambiano quando cambiamo noi idea su cosa supportare.
 */

export interface TrackingPlatform {
  name: string;
  /** Spuntata all'apertura: sono quelle che quasi ogni negozio usa. */
  preselected?: boolean;
}

export interface TrackingCategory {
  id: string;
  title: string;
  platforms: TrackingPlatform[];
}

export const TRACKING_CATEGORIES: TrackingCategory[] = [
  {
    id: 'social',
    title: 'Social & Browser',
    platforms: [
      { name: 'Meta Ads', preselected: true },
      { name: 'Google Ads', preselected: true },
      { name: 'TikTok Ads' },
      { name: 'Pinterest Ads' },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    platforms: [{ name: 'Klaviyo' }],
  },
  {
    id: 'crm',
    title: 'CRM',
    platforms: [{ name: 'HubSpot' }, { name: 'GoHighLevel' }],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    platforms: [{ name: 'Google Analytics 4', preselected: true }],
  },
];

/** Le piattaforme spuntate all'apertura del passo. */
export function defaultSelection(
  categories: TrackingCategory[] = TRACKING_CATEGORIES,
): string[] {
  return categories.flatMap((category) =>
    category.platforms.filter((p) => p.preselected).map((p) => p.name),
  );
}

/** Quante, di una categoria, sono spuntate adesso. */
export function selectedInCategory(
  category: TrackingCategory,
  selected: readonly string[],
): number {
  return category.platforms.filter((p) => selected.includes(p.name)).length;
}

/**
 * Le due risposte possibili.
 *
 * `needs` e' una richiesta di contatto, `has` una dichiarazione: sono cose
 * diverse e vanno distinte, ma entrambe chiudono il passo — nessuno deve
 * restare bloccato dalla configurazione per non aver voluto essere ricontattato.
 */
export type ServerSideAnswer = 'needs' | 'has';

export function isServerSideAnswer(value: unknown): value is ServerSideAnswer {
  return value === 'needs' || value === 'has';
}

/**
 * I nomi accettati da chi salva la risposta.
 *
 * Solo quelli del catalogo: la lista arriva dal browser, e senza questo filtro
 * chiunque potrebbe scriverci dentro qualunque cosa.
 */
export function knownPlatforms(
  names: unknown,
  categories: TrackingCategory[] = TRACKING_CATEGORIES,
): string[] {
  if (!Array.isArray(names)) return [];
  const catalog = new Set(
    categories.flatMap((category) => category.platforms.map((p) => p.name)),
  );
  return names.filter(
    (name): name is string => typeof name === 'string' && catalog.has(name),
  );
}
