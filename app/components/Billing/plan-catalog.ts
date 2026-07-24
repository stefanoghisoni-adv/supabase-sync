// Catalogo di presentazione della tab Piano. NON e' la fonte dei limiti tecnici
// di billing (quelli vivono nel modello Plan): qui e' solo copy commerciale, cosi'
// possiamo elencare anche feature senza campo nel DB (es. "Push manuale").
export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export interface PlanFeature {
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
      { label: 'Fino a 50 prodotti', included: true },
      { label: 'Sync automatica ogni 7 giorni', included: true },
      { label: 'Push manuale', included: false },
      { label: 'Sync clienti', included: false },
      { label: 'Supporto via email', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    recommended: true,
    features: [
      { label: 'Fino a 100 prodotti', included: true },
      { label: 'Sync automatica ogni 6 ore', included: true },
      { label: 'Push manuale', included: false },
      { label: 'Sync clienti fino a 5.000', included: true },
      { label: 'Supporto via email', included: true },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    priceMonthly: 99,
    recommended: false,
    features: [
      { label: 'Fino a 400 prodotti', included: true },
      { label: 'Sync automatica ogni ora', included: true },
      { label: 'Push manuale', included: true },
      { label: 'Sync clienti fino a 50.000', included: true },
      { label: 'Supporto via chat dedicata', included: true },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 299,
    recommended: false,
    features: [
      { label: 'Prodotti illimitati', included: true },
      { label: 'Sync automatica ogni 30 minuti', included: true },
      { label: 'Push manuale', included: true },
      { label: 'Sync clienti illimitati', included: true },
      { label: 'Supporto via chat dedicata', included: true },
    ],
  },
];
