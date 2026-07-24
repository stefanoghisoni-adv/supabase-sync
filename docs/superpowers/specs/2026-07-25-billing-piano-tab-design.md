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
- Voce **Piano** nella `NavMenu` di `app/root.tsx`, posizionata **subito prima di
  Impostazioni** (ordine finale: Dashboard, Prodotti con problemi, Logs, Piano,
  Impostazioni).
- Catalogo piani/feature in un config tipizzato in codice.
- Helper puro per l'ordinamento delle feature (verdi in alto) + test.
- Azione "Impostazioni" a livello del titolo tab (coerente con Dashboard e Logs).
- Spazio in fondo alla tab (`Box paddingBlockEnd`), come le altre tab.
- **Allineamento frequenza Free a 7 giorni**: il cron reale del piano Free passa da
  24h a 168h (7 giorni), così vetrina e comportamento coincidono. Vedi sezione
  dedicata più sotto.

Fuori:
- Shopify Billing API / creazione o cambio abbonamento reale.
- Toggle mensile/annuale (mostriamo solo il prezzo mensile).
- Lettura dei piani dal DB (per la vetrina; la frequenza Free resta nel `Plan`).

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

## Frequenza sync del Free → 7 giorni

`Plan.maxSyncFrequencyHours` guida sia lo scheduler (`scheduler.server.ts`,
`api.cron.sync.tsx`: `intervalMs = maxSyncFrequencyHours * 3600 * 1000`) sia la
label mostrata in Impostazioni. Portare il Free a 7 giorni richiede tre passi:

1. **Seed** (`prisma/seed.ts`): `maxSyncFrequencyHours` del Free da `24` a `168`.
2. **DB live**: il seed usa `createMany({ skipDuplicates: true })`, quindi **non**
   tocca la riga esistente. Serve una UPDATE manuale una tantum:
   `UPDATE plans SET max_sync_frequency_hours = 168 WHERE plan_name = 'free';`
3. **Label** (`account-format.ts` `syncFrequencyLabel`): oggi 168h renderebbe
   "Ogni 168 ore". Estendere: se `hours` è multiplo di 24 e ≥ 24 → "Ogni N giorni"
   ("Ogni 7 giorni" per 168, "Ogni giorno" per 24). Aggiornare il relativo test.

Così la vetrina della tab Piano ("Free: ogni 7 giorni") coincide con il cron reale
e con la label in Impostazioni.

## Testing

- `plan-features.test.ts`: `sortFeatures` mette i verdi prima dei grigi, è stabile,
  gestisce liste tutte-verdi / tutte-grigie / vuote.
- `plan-catalog.test.ts`: integrità del catalogo — 4 piani nell'ordine atteso,
  esattamente un `recommended` (Pro), ogni piano ha le 5 feature attese.
- `account-format.test.ts`: aggiungere casi per `syncFrequencyLabel` con i giorni
  (168 → "Ogni 7 giorni", 24 → "Ogni giorno"), senza rompere i casi ore/minuti.

## Rischi / note

- Il CTA non fa nulla: va chiarito nell'handoff che è un placeholder in attesa del
  wiring Billing, così non sembra un bug.
- La UPDATE del DB live (passo 2 sopra) è manuale e va eseguita in produzione:
  senza, i negozi Free continuerebbero a sincronizzare ogni 24h mentre la vetrina
  annuncia 7 giorni.
- Label piano: `account-format.ts` mappa `pro → "Pro+"`. La spec usa "Pro" nel
  catalogo della vetrina; se si vuole coerenza, allineare a "Pro+" (punto minore,
  da decidere in implementazione).
