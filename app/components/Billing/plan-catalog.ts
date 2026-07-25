// Catalogo di presentazione della tab Piano. NON e' la fonte dei limiti tecnici
// di billing (quelli vivono nel modello Plan): qui e' solo copy commerciale, cosi'
// possiamo elencare anche feature senza campo nel DB (es. "Push manuale").
export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

// Ogni card mostra ESATTAMENTE queste righe, in questo ordine: cambia solo la
// disponibilita' (spunta verde / X grigia) e il valore dentro la label. Cosi' le
// righe delle 4 card restano allineate e le card hanno la stessa altezza.
export const FEATURE_ORDER = [
  'products',
  'sync',
  'email',
  'customers',
  'push',
  'chat',
] as const;

export type FeatureKey = (typeof FEATURE_ORDER)[number];

export interface PlanFeature {
  key: FeatureKey;
  // Label corta per scelta: nella griglia a 4 colonne una label lunga andrebbe a
  // capo, alzando solo quella card. Vedi il test sulla lunghezza massima.
  label: string;
  included: boolean; // true = SI (verde), false = NO (grigio)
}

export interface PlanCard {
  id: PlanId;
  name: string;
  priceMonthly: number; // euro, intero
  recommended: boolean; // true solo per Pro
  features: PlanFeature[];
}

export const PLAN_CATALOG: PlanCard[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    recommended: false,
    features: [
      { key: 'products', label: 'Fino a 50 prodotti', included: true },
      { key: 'sync', label: 'Sync ogni 7 giorni', included: true },
      { key: 'email', label: 'Supporto via email', included: true },
      { key: 'customers', label: 'Sync clienti', included: false },
      { key: 'push', label: 'Push manuale', included: false },
      { key: 'chat', label: 'Chat dedicata', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    recommended: true,
    features: [
      { key: 'products', label: 'Fino a 100 prodotti', included: true },
      { key: 'sync', label: 'Sync ogni 4 giorni', included: true },
      { key: 'email', label: 'Supporto via email', included: true },
      { key: 'customers', label: 'Fino a 5.000 clienti', included: true },
      { key: 'push', label: 'Push manuale', included: false },
      { key: 'chat', label: 'Chat dedicata', included: false },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    priceMonthly: 99,
    recommended: false,
    features: [
      { key: 'products', label: 'Fino a 400 prodotti', included: true },
      { key: 'sync', label: 'Sync ogni 2 giorni', included: true },
      { key: 'email', label: 'Supporto via email', included: true },
      { key: 'customers', label: 'Fino a 50.000 clienti', included: true },
      { key: 'push', label: 'Push manuale', included: true },
      { key: 'chat', label: 'Chat dedicata', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 299,
    recommended: false,
    features: [
      { key: 'products', label: 'Prodotti illimitati', included: true },
      { key: 'sync', label: 'Sync ogni giorno', included: true },
      { key: 'email', label: 'Supporto via email', included: true },
      { key: 'customers', label: 'Clienti illimitati', included: true },
      { key: 'push', label: 'Push manuale', included: true },
      { key: 'chat', label: 'Chat dedicata', included: true },
    ],
  },
];
