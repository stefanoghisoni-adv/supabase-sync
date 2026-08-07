import { syncFrequencyLabel } from '~/components/Dashboard/account-format';
import { isSelectablePlan } from './plan-access';

// Le card della tab Piano si costruiscono dalla tabella `plans`: nome, prezzo e
// limiti sono quelli registrati li', non una copia scritta a mano che col tempo
// finirebbe per raccontare qualcosa di diverso da cio' che l'app applica
// davvero. Il nome compare com'e' scritto nella colonna, senza ritocchi.
//
// Resta qui il solo testo che nel database non c'e': le righe che descrivono il
// livello di assistenza.

// Ogni card mostra ESATTAMENTE queste righe, in questo ordine: cambia solo la
// disponibilita' (spunta verde / X grigia) e il valore dentro la label. Cosi' le
// righe delle card restano allineate e le card hanno la stessa altezza.
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
  // Label corta per scelta: nella griglia a piu' colonne una label lunga andrebbe
  // a capo, alzando solo quella card. Vedi il test sulla lunghezza massima.
  label: string;
  included: boolean; // true = SI (verde), false = NO (grigio)
}

export interface PlanCard {
  /** Nome del piano com'e' scritto nella tabella: e' anche la chiave. */
  name: string;
  priceMonthly: number;
  priceYearly: number;
  /** Prezzo riservato al partner del negozio, se ce n'e' uno. null = listino. */
  partnerMonthly: number | null;
  partnerYearly: number | null;
  recommended: boolean;
  features: PlanFeature[];
}

/** La riga di `plans` per come serve alla tab. */
export interface PlanRow {
  planName: string;
  priceYearly: number;
  priceMonthly: number;
  maxProducts: number | null;
  maxCustomers: number | null;
  maxSyncFrequencyHours: number;
  customersSyncEnabled: boolean;
  supportLevel: string;
}

// Piano proposto per primo. Il confronto e' senza maiuscole perche' il nome nella
// tabella lo scrive l'owner e puo' cambiare forma.
const RECOMMENDED_PLAN = 'pro';

/** I numeri lunghi si leggono a colpo d'occhio solo raggruppati: 50.000. */
function amount(value: number): string {
  return value.toLocaleString('it-IT');
}

function productsFeature(plan: PlanRow): PlanFeature {
  return {
    key: 'products',
    label:
      plan.maxProducts == null
        ? 'Prodotti illimitati'
        : `Fino a ${amount(plan.maxProducts)} prodotti`,
    included: true,
  };
}

function customersFeature(plan: PlanRow): PlanFeature {
  if (!plan.customersSyncEnabled) {
    return { key: 'customers', label: 'Sync clienti', included: false };
  }
  return {
    key: 'customers',
    label:
      plan.maxCustomers == null
        ? 'Clienti illimitati'
        : `Fino a ${amount(plan.maxCustomers)} clienti`,
    included: true,
  };
}

// Assistenza: nella tabella c'e' un livello (`support_level`), qui diventa le tre
// righe che il merchant legge.
const PUSH_LEVELS = new Set(['priority', 'dedicated']);
const CHAT_LEVELS = new Set(['dedicated']);

export function buildPlanFeatures(plan: PlanRow): PlanFeature[] {
  const level = (plan.supportLevel ?? '').trim().toLowerCase();
  return [
    productsFeature(plan),
    {
      key: 'sync',
      // "Ogni 7 giorni" -> "Sync ogni 7 giorni".
      label: `Sync ${syncFrequencyLabel(plan.maxSyncFrequencyHours).toLowerCase()}`,
      included: true,
    },
    { key: 'email', label: 'Supporto via email', included: true },
    customersFeature(plan),
    { key: 'push', label: 'Push manuale', included: PUSH_LEVELS.has(level) },
    { key: 'chat', label: 'Chat dedicata', included: CHAT_LEVELS.has(level) },
  ];
}

/**
 * Le card da mostrare, dal piano piu' economico al piu' caro.
 *
 * Fuori restano i piani non acquistabili (lifetime, assegnato dall'owner): non
 * c'e' nulla da comprare e non hanno posto in un listino.
 */
export function buildPlanCards(
  plans: PlanRow[],
  /** Listino riservato del negozio, per nome piano. Vuoto = nessuno sconto. */
  partnerPrices: Record<string, { priceMonthly: number; priceYearly: number }> = {},
): PlanCard[] {
  return plans
    .filter((plan) => isSelectablePlan(plan.planName))
    .sort((a, b) => a.priceMonthly - b.priceMonthly || a.planName.localeCompare(b.planName))
    .map((plan) => {
      const reserved = partnerPrices[plan.planName] ?? null;
      return {
        name: plan.planName,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        partnerMonthly: reserved?.priceMonthly ?? null,
        partnerYearly: reserved?.priceYearly ?? null,
        recommended: plan.planName.trim().toLowerCase() === RECOMMENDED_PLAN,
        features: buildPlanFeatures(plan),
      };
    });
}

/** Prezzo come va scritto sulla card: "29", "0", "9,90". */
export function formatPrice(priceMonthly: number): string {
  return Number.isInteger(priceMonthly)
    ? String(priceMonthly)
    : priceMonthly.toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
