// Raggruppamento delle region Supabase per continente, per il dropdown di
// creazione progetto. Modulo client-safe (niente .server): lo importa anche il
// componente della dashboard.

export interface RegionOption {
  id: string;
  name: string;
}

// Forma accettata da <Select> di Polaris per i gruppi: rende un <optgroup>.
export interface RegionGroup {
  title: string;
  options: { label: string; value: string }[];
}

// Il continente si ricava dal prefisso della region AWS (eu-, us-, ap-, …), non
// da una tabella id-per-id: listRegions puo' restituire region dinamiche dalla
// Management API, e una region nuova deve finire in un gruppo sensato da sola.
// Europa in cima: e' la scelta giusta per la quasi totalita' dei merchant qui.
const CONTINENTS: { title: string; prefixes: string[] }[] = [
  { title: 'Europa', prefixes: ['eu-'] },
  { title: 'America del Nord', prefixes: ['us-', 'ca-'] },
  { title: 'America del Sud', prefixes: ['sa-'] },
  { title: 'Asia e Pacifico', prefixes: ['ap-'] },
  { title: 'Medio Oriente', prefixes: ['me-'] },
  { title: 'Africa', prefixes: ['af-'] },
];

const FALLBACK_TITLE = 'Altre regioni';

export function groupRegionsByContinent(regions: RegionOption[]): RegionGroup[] {
  const buckets = new Map<string, { label: string; value: string }[]>();

  for (const region of regions) {
    const continent = CONTINENTS.find((c) =>
      c.prefixes.some((p) => region.id.startsWith(p)),
    );
    const title = continent?.title ?? FALLBACK_TITLE;
    const bucket = buckets.get(title) ?? [];
    bucket.push({ label: region.name, value: region.id });
    buckets.set(title, bucket);
  }

  // Ordine fisso dei gruppi (non quello di arrivo), con le sconosciute in fondo.
  // I gruppi senza opzioni non vengono emessi.
  const ordered = [...CONTINENTS.map((c) => c.title), FALLBACK_TITLE];
  return ordered
    .filter((title) => buckets.has(title))
    .map((title) => ({ title, options: buckets.get(title)! }));
}
