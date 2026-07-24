# Tab "Piano" — presentazione dei piani (slice 1: solo UI)

## Obiettivo

Aggiungere una tab dedicata **Piano** che presenta i 4 piani commerciali
(Free / Pro / Business / Enterprise) come una pricing table. Il piano **Pro** è
quello consigliato e va risaltato. Il piano attuale del negozio è evidenziato.

Questa è la **prima slice**: **solo UI di presentazione**. Nessun addebito reale,
nessuna chiamata alle Shopify Billing API. Il pulsante di scelta piano è un
placeholder. Il wiring del billing (creazione abbonamento, approvazione, stato)
è una slice successiva, fuori da questa spec.

## Scope

Dentro:
- Nuova route `app/routes/plan.tsx` con la pricing table a 4 card.
- Voce **Piano** nella `NavMenu` di `app/root.tsx`.
- Catalogo piani/feature in un config tipizzato in codice.
- Helper puro per l'ordinamento delle feature (verdi in alto) + test.
- Azione "Impostazioni" a livello del titolo tab (coerente con Dashboard e Logs).
- Spazio in fondo alla tab (`Box paddingBlockEnd`), come le altre tab.

Fuori:
- Shopify Billing API / creazione o cambio abbonamento reale.
- Toggle mensile/annuale (mostriamo solo il prezzo mensile).
- Modifiche all'enforcement o al cron (es. allineare la frequenza reale del Free
  a 7 giorni): il config è presentazione, la frequenza tecnica resta nel seed.
- Lettura dei piani dal DB.

## Fonte dati: config in codice

Motivo: la feature "Push manuale" non ha un campo nel modello `Plan`, e la tab è
presentazione commerciale, da tenere disaccoppiata dai limiti tecnici di billing.
Un unico config tipizzato è più semplice da leggere/modificare e non dipende dal DB.

File: `app/components/Billing/plan-catalog.ts`

```ts
export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export interface PlanFeature {
  label: string;        // es. "Fino a 100 prodotti", "Push manuale"
  included: boolean;    // true = SÌ (verde), false = NO (grigio)
}

export interface PlanCard {
  id: PlanId;
  name: string;         // "Free", "Pro", ...
  priceMonthly: number; // in euro, intero
  recommended: boolean; // true solo per Pro
  features: PlanFeature[];
}

export const PLAN_CATALOG: PlanCard[]; // ordine: free, pro, business, enterprise
```

I prezzi replicano il seed (0 / 29 / 99 / 299). È una duplicazione accettabile: i
prezzi cambiano di rado e qui servono solo alla vetrina.

## Matrice feature (definitiva)

| Feature          | Free           | Pro            | Business          | Enterprise         |
|------------------|----------------|----------------|-------------------|--------------------|
| Prodotti         | ✓ Fino a 50    | ✓ Fino a 100   | ✓ Fino a 400      | ✓ Illimitati       |
| Sync automatica  | ✓ ogni 7 giorni| ✓ ogni 6 ore   | ✓ ogni ora        | ✓ ogni 30 minuti   |
| Push manuale     | ✗              | ✗              | ✓                 | ✓                  |
| Sync clienti     | ✗              | ✓ Fino a 5.000 | ✓ Fino a 50.000   | ✓ Illimitati       |
| Supporto         | ✓ Email        | ✓ Email        | ✓ Chat dedicata   | ✓ Chat dedicata    |

Ogni card mostra lo **stesso set di 5 feature** (con ✗ dove mancano), così il
confronto è leggibile e l'ordinamento "verde in alto" ha senso.

## Rendering delle feature

Componente `PlanFeatureList` (`app/components/Billing/PlanFeatureList.tsx`):
- Ordina le feature con un helper puro `sortFeatures(features)`: prima le
  `included: true` (verdi), poi le `included: false` (grigie); **stabile** (mantiene
  l'ordine di catalogo dentro ciascun gruppo).
- Ogni riga: `InlineStack` con `Icon` a sinistra + `Text`.
  - SÌ: `Icon source={CheckIcon} tone="success"` + `Text tone="success"`.
  - NO: `Icon source={XIcon} tone="subdued"` + `Text tone="subdued"`.

Helper isolato e testabile: `app/components/Billing/plan-features.ts` con
`sortFeatures(features: PlanFeature[]): PlanFeature[]`.

## Layout Polaris

Route `plan.tsx`:
- `Page title="Piano"` con `secondaryActions` "Impostazioni" (icona + url
  `/settings/supabase`, con loading/disabled da `useNavigation`, come Dashboard/Logs).
- `InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400"` con le 4 card.
- Ogni `Card`:
  - Nome piano (`Text as="h2" variant="headingMd"`).
  - Badge "Consigliato" (`Badge tone="success"`) solo su Pro; badge "Piano attuale"
    (`Badge tone="info"`) sul piano corrente.
  - Prezzo: `Text variant="headingLg"` con `€{priceMonthly}` + `Text tone="subdued"` "/mese".
  - `PlanFeatureList`.
  - Pulsante CTA (placeholder): "Piano attuale" `disabled` per il corrente,
    altrimenti "Scegli {name}" (`variant="primary"` su Pro, altrimenti secondario).
    Nessuna azione reale in questa slice.
- Spacer finale `Box paddingBlockEnd="800"`.

Evidenziazione Pro **solo con Polaris**: la card Pro usa `background="bg-surface-selected"`
(o `Box` con `borderColor`/`borderWidth` token Polaris) per staccarsi, più il badge
"Consigliato". Nessun CSS custom.

## Piano corrente

`plan.tsx` loader legge `shop.currentPlan` (via sessione → `prisma.shop`). Passa
l'id corrente alla vista; la card corrispondente mostra il badge "Piano attuale" e
il bottone disabilitato. Se `currentPlan` non è tra i 4 (es. `lifetime`), nessuna
card risulta "attuale" (nessun crash).

## Testing

- `plan-features.test.ts`: `sortFeatures` mette i verdi prima dei grigi, è stabile,
  gestisce liste tutte-verdi / tutte-grigie / vuote.
- `plan-catalog.test.ts`: integrità del catalogo — 4 piani nell'ordine atteso,
  esattamente un `recommended` (Pro), ogni piano ha le 5 feature attese.

## Rischi / note

- **Copy vs realtà**: il config annuncia "Free: ogni 7 giorni" mentre il seed ha
  Free a 24h. Finché non allineiamo l'enforcement (slice futura), la vetrina e il
  comportamento reale del cron divergono per il Free. Annotato consapevolmente.
- Il CTA non fa nulla: va chiarito nell'handoff che è un placeholder in attesa del
  wiring Billing, così non sembra un bug.
