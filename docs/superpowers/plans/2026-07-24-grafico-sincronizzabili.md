# Grafico dei prodotti sincronizzabili (30 giorni) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** In dashboard, a destra dello Stepper, un grafico a linee con i prodotti sincronizzabili degli ultimi 30 giorni e una linea tratteggiata arancione sul limite del piano.

## Il design in breve

**L'unità di misura.** La soglia del piano (`Plan.maxProducts`) si applica ai **prodotti distinti**: la sync conta `existingProductIds.size >= maxProducts` (`processors.server.ts:211`). Il `readyCount` che la dashboard mostra come "Prodotti idonei" conta invece le **varianti** (`computeProductReadiness`). Le due grandezze non sono confrontabili: 50 prodotti da 3 varianti fanno 150 varianti idonee contro una soglia di 50. Il grafico usa quindi una metrica nuova — **prodotti distinti con almeno una variante idonea** — che è l'unica sovrapponibile alla linea arancione.

**Lo storico non esiste**, quindi lo si costruisce: uno snapshot al giorno per negozio, scritto dal cron. Il grafico nasce con un punto solo e si riempie in 30 giorni. Non si stima il passato.

**polaris-viz non è SSR-safe**: `renderToStaticMarkup` di un `LineChart` fallisce con `window is not defined` (verificato). Il grafico va montato solo dopo l'idratazione.

## Global Constraints

- **Solo componenti Polaris / polaris-viz.** Niente `div` con CSS custom se esiste il componente.
- `@shopify/polaris-viz@^16.16.0` è **già installato** in `package.json`: non reinstallarlo, non cambiarne la versione.
- Lo snapshot è **uno al giorno per negozio**: prima di scansionare Shopify va verificato che manchi, altrimenti il cron (che gira ogni 30 minuti) rifarebbe la scansione completa a ogni giro.
- Un errore nello snapshot **non deve** far fallire il periodic check dello stesso negozio: try/catch separato, come già si fa per gli altri errori nel cron.
- **Non esiste infrastruttura per test di componenti React**: non aggiungerla. Il Task 3 si verifica con `tsc` + build, non con test unitari.
- La suite riporta **300 test** a inizio lavoro. Se ne vedi molti meno il comando è stato interrotto: rilancialo.
- TDD sui Task 1 e 2. `npx vitest run`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: Snapshot giornaliero dei prodotti sincronizzabili

**Files:**
- Modify: `app/lib/stats/product-readiness.ts` (nuova funzione di conteggio)
- Modify: `prisma/schema.prisma` (nuovo modello + relazione su `Shop`)
- Create: `app/lib/stats/eligibility-snapshot.server.ts`
- Modify: `app/routes/api.cron.sync.tsx`
- Test: `app/lib/stats/product-readiness.test.ts` (esiste già: estendilo)

**Interfaces:**
- Produces: `countEligibleProducts(products: ShopifyProduct[]): number`
- Produces: `recordEligibilitySnapshotIfMissing(shop): Promise<'written' | 'skipped'>`

- [ ] **Step 1: Scrivi i test che falliscono**

In `app/lib/stats/product-readiness.test.ts`, per `countEligibleProducts`:
1. Prodotto con 3 varianti di cui 1 con costo → conta **1** (il prodotto, non le varianti).
2. Prodotto con tutte le varianti senza costo → conta **0**.
3. Due prodotti idonei + uno non idoneo → conta **2**.
4. Variante con costo `'0.00'` → il prodotto è idoneo (coerente con `isVariantReady`).

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/stats/product-readiness.test.ts`
Expected: FAIL — la funzione non esiste.

- [ ] **Step 3: Implementa il conteggio**

In `app/lib/stats/product-readiness.ts`, accanto a `computeProductReadiness`:

```ts
// Prodotti DISTINTI con almeno una variante idonea. Unita' diversa da
// readyCount, che conta le varianti: il tetto del piano (maxProducts) si applica
// ai prodotti, quindi e' questo il numero da confrontare con quella soglia.
export function countEligibleProducts(products: ShopifyProduct[]): number {
  return products.filter((p) => p.variants.some((v) => isVariantReady(v.cost))).length;
}
```

- [ ] **Step 4: Il modello**

In `prisma/schema.prisma`:

```prisma
model ProductEligibilitySnapshot {
  id            String   @id @default(uuid())
  shopId        String   @map("shop_id")
  // Giorno UTC dello snapshot: una riga per negozio per giorno.
  day           DateTime @map("day") @db.Date
  eligibleCount Int      @map("eligible_count")
  createdAt     DateTime @default(now()) @map("created_at")

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, day])
  @@map("product_eligibility_snapshots")
}
```

e sul modello `Shop`, accanto alle altre relazioni, aggiungi:

```prisma
  eligibilitySnapshots ProductEligibilitySnapshot[]
```

Poi `npx prisma generate` (**non** `migrate`: il pooler non esegue DDL, la tabella viene creata a mano — vedi la sezione SQL in fondo).

- [ ] **Step 5: La funzione di snapshot**

Crea `app/lib/stats/eligibility-snapshot.server.ts`. Riusa il modo di paginare di `app/routes/api.stats.products.tsx` (stessi `fields: 'id,variants'` e stesso `enrichVariantCosts`, che è indispensabile: senza, `variant.cost` è sempre vuoto e il conteggio sarebbe zero).

```ts
// Mezzanotte UTC di oggi: la chiave del giorno deve essere stabile a prescindere
// dall'ora in cui il cron passa.
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

La funzione:
1. calcola `day = today()`;
2. `findUnique` su `{ shopId_day: { shopId, day } }` → se esiste, ritorna `'skipped'` **senza** toccare Shopify (è il guard che evita una scansione completa ogni 30 minuti);
3. altrimenti pagina il catalogo, somma `countEligibleProducts` pagina per pagina;
4. `create` della riga e ritorna `'written'`.

- [ ] **Step 6: Aggancio al cron**

In `app/routes/api.cron.sync.tsx`, dentro il `for (const shop of shops)` già presente, **prima** del blocco del periodic check, in un try/catch suo:

```ts
    // Snapshot giornaliero per il grafico: in un try/catch separato perche' una
    // sua rottura non deve impedire la sync vera e propria del negozio.
    try {
      const result = await recordEligibilitySnapshotIfMissing(shop);
      if (result === 'written') results.snapshots++;
    } catch (error) {
      console.error(`Snapshot idoneita' fallito per ${shop.shopDomain}:`, error);
    }
```

Aggiungi `snapshots: 0` all'oggetto `results`.

- [ ] **Step 7: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: snapshot giornaliero dei prodotti sincronizzabili"
```

---

### Task 2: L'endpoint della serie storica

**Files:**
- Create: `app/routes/api.stats.product-history.tsx`
- Create: `app/lib/stats/history-series.ts` (logica pura, testabile)
- Test: `app/lib/stats/history-series.test.ts`

**Interfaces:**
- Produces: `GET /api/stats/product-history` → `{ points: { day: string; count: number }[]; planLimit: number | null }`

- [ ] **Step 1: Scrivi i test che falliscono**

`buildHistorySeries(snapshots, today)` in `history-series.ts` deve:
1. restituire i punti in ordine cronologico crescente;
2. formattare `day` come `YYYY-MM-DD` (stringa, non Date: il client non deve riparsare);
3. **non** inventare giorni mancanti (nessun riempimento: se il cron non è passato, quel giorno non c'è);
4. scartare gli snapshot più vecchi di 30 giorni rispetto a `today`.

- [ ] **Step 2: Verifica il fallimento, poi implementa**

Run: `npx vitest run app/lib/stats/history-series.test.ts`

- [ ] **Step 3: La route**

`app/routes/api.stats.product-history.tsx`, sullo stile di `api.stats.products.tsx`:

```ts
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response('Shop not found', { status: 404 });

  const from = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const snapshots = await prisma.productEligibilitySnapshot.findMany({
    where: { shopId: shop.id, day: { gte: from } },
    orderBy: { day: 'asc' },
  });

  const plan = await prisma.plan.findUnique({ where: { planName: shop.currentPlan } });

  return json({
    points: buildHistorySeries(snapshots, new Date()),
    // null = piano senza tetto: il grafico non disegnera' la soglia.
    planLimit: plan?.maxProducts ?? null,
  });
}
```

- [ ] **Step 4: Verifica completa e commit**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add -A && git commit -m "feat: endpoint della serie storica dei prodotti sincronizzabili"
```

---

### Task 3: Il grafico in dashboard

**Files:**
- Create: `app/components/Dashboard/EligibilityChart.tsx`
- Modify: `app/root.tsx` (foglio di stile di polaris-viz)
- Modify: `app/routes/_index.tsx` (fetcher + posizionamento)

- [ ] **Step 1: Il foglio di stile**

In `app/root.tsx`, accanto agli altri:

```ts
import vizStyles from '@shopify/polaris-viz/build/esm/styles.css?url';
// ...
  { rel: 'stylesheet', href: vizStyles },
```

- [ ] **Step 2: Il componente**

`app/components/Dashboard/EligibilityChart.tsx`. Punti obbligati:

**Montaggio client-only.** `LineChart` legge `window` durante il render: in SSR esplode. Quindi:

```tsx
  // polaris-viz tocca window in fase di render: in SSR fallirebbe con
  // "window is not defined". Si monta solo dopo l'idratazione, con uno
  // SkeletonBodyText al posto suo nel frattempo.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
```

**La soglia** è una seconda serie costante, non un'annotazione: le `Annotation` di polaris-viz non espongono il colore, mentre una serie sì.

```tsx
const series = [
  { name: 'Prodotti sincronizzabili', data: points.map((p) => ({ key: p.day, value: p.count })) },
];
if (planLimit != null) {
  series.push({
    name: 'Limite del piano',
    data: points.map((p) => ({ key: p.day, value: planLimit })),
    color: '#FF8A00',
    styleOverride: { line: { strokeDasharray: '6 4', width: 2, hasArea: false } },
  });
}
```

**Stato vuoto.** Con `points.length === 0` non disegnare il grafico: un `Text tone="subdued"` che spiega che lo storico si costruisce da qui in avanti, un punto al giorno. Con un solo punto il grafico si disegna comunque (un marker isolato): va bene, non trattarlo come caso speciale.

Il tutto dentro una `Card` con `Text as="h2" variant="headingMd"` — titolo: **"Prodotti sincronizzabili"**. Sotto il titolo, un `Text tone="subdued"` con "Ultimi 30 giorni". Il grafico va avvolto in `PolarisVizProvider` e gli va data un'altezza esplicita tramite la prop `theme`/contenitore previsto da polaris-viz (`<div style={{height: 260}}>` è ammesso qui: polaris-viz **richiede** un contenitore con altezza, non esiste un componente Polaris che lo faccia).

- [ ] **Step 3: In dashboard**

In `app/routes/_index.tsx`, la `InlineGrid` di riga ~563 contiene oggi il solo `<Stepper>`. Aggiungi il grafico come secondo figlio, così occupa la metà destra:

```tsx
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Stepper steps={stepperItems} />
          <EligibilityChart points={history?.points ?? []} planLimit={history?.planLimit ?? null} loading={!history} />
        </InlineGrid>
```

Il caricamento dei dati segue lo schema degli altri riquadri: `useFetcher` verso `/api/stats/product-history`, caricato in un `useEffect` al mount come già fanno `countsFetcher` e gli altri.

- [ ] **Step 4: Verifica**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi. **Il build è la verifica che conta**: se polaris-viz rompesse la compilazione SSR, emergerebbe qui.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: grafico dei prodotti sincronizzabili in dashboard"
```

---

## SQL da eseguire a mano (prima del deploy)

Sul database **owner** (non quello del merchant). Il pooler sulla 6543 non esegue DDL,
quindi la tabella va creata dall'SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS product_eligibility_snapshots (
  id             TEXT PRIMARY KEY,
  shop_id        TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  eligible_count INTEGER NOT NULL,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_eligibility_snapshots_shop_id_day_key
  ON product_eligibility_snapshots(shop_id, day);
```

## Note di verifica manuale (post-deploy)

- Il primo passaggio del cron scrive una riga in `product_eligibility_snapshots`; il secondo, nello stesso giorno, **non** ne scrive un'altra (`snapshots: 0` nella risposta del cron).
- In dashboard il riquadro mostra un punto solo il primo giorno, con la linea arancione alla quota del piano.
- Su un piano senza tetto (`maxProducts` null) la linea arancione non compare.
