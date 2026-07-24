# Card Account in Impostazioni + dashboard a due card

**Data:** 2026-07-24
**Stato:** design approvato, pronto per il piano

## Obiettivo

1. Spostare la card **Account** dalla dashboard alla pagina **Impostazioni**,
   invariata (stesse righe, stessi badge).
2. La dashboard resta con **due card che si dividono la riga**: Prodotti a
   sinistra, Clienti a destra.
3. Nella card Clienti bloccata, **sotto il pulsante "Aggiorna piano"**, una
   descrizione in grigio.

## 1. Account in Impostazioni

Il componente `AccountCard` esistente viene riusato **tale e quale** e collocato
**in cima** alla pagina Impostazioni, sopra "Progetto collegato".

Righe invariate: `Database` (grigio "Non collegato" / verde "Collegato"), `Piano`
(grigio, Free/Pro+/Business/Enterprise/Lifetime), `Frequenza sync` (grigio,
"Ogni <intervallo>").

### La card deve comparire SEMPRE

Oggi il loader di `settings.supabase.tsx` restituisce `{ config: null }` quando
manca `supabaseConfig`, e la pagina mostra solo un banner. Ma proprio in quel caso
"Database: **Non collegato**" è l'informazione più utile.

Il loader va quindi ristrutturato: le informazioni di account viaggiano **separate**
da `config` e sono sempre presenti.

```
return json({
  account: { connected, planName, syncFrequencyHours },
  config: /* come oggi: null se non collegato */,
});
```

Dati da recuperare (oggi il loader non li carica):

- `connected` = `!!shop.supabaseConfig?.connectionVerifiedAt`
- `planName` = `shop.currentPlan`
- `syncFrequencyHours` = `Plan.maxSyncFrequencyHours` del piano corrente (richiede
  una `prisma.plan.findUnique`, oggi assente in questa route)

Nota: `AccountCard` è già tollerante ai valori mancanti — `planLabel(null)` e
`syncFrequencyLabel(null)` restituiscono `—`.

## 2. Dashboard a due card

L'`InlineGrid` passa da tre a **due colonne**: `columns={{ xs: 1, md: 2 }}`, con
`ProductsCard` a sinistra e `CustomersCard` a destra. Si rimuovono l'uso e
l'import di `AccountCard`, e dal loader della dashboard i dati che servivano solo
a lei (`syncFrequencyHours`).

`supabaseConnected` resta nel loader: è usato anche dallo Stepper.

## 3. Descrizione sotto "Aggiorna piano"

Nella variante **bloccata** di `CustomersCard` — l'unica dove il pulsante esiste —
sotto il pulsante, testo **verbatim**:

> Potenzia la trasmissione dei dati utente monitorando anche il lifetime value (LTV) e lifetime profit (LTP).

In grigio (`tone="subdued"`), centrato sotto il pulsante, dentro l'overlay.

Il contenuto sotto il velo resta `aria-hidden` e senza elementi focalizzabili: la
descrizione sta **nell'overlay** insieme al pulsante, non nelle righe nascoste,
quindi resta leggibile dagli screen reader.

## Fuori scope

- Nessuna modifica alle altre card di Impostazioni ("Progetto collegato",
  "Lettura dei dati", "Sincronizzazione"): restano dove sono, invariate.
- Nessuna modifica a `ProductsCard`, allo Stepper, al log di sincronizzazione.
- Nessuna modifica alla sincronizzazione o al proxy.

## Test

Il progetto **non ha infrastruttura per test di componenti React**: non va
aggiunta. `AccountCard` e le sue funzioni pure (`planLabel`,
`syncFrequencyLabel`) sono già coperte dai test esistenti, che restano validi
perché il componente non cambia.

La verifica di questo lavoro è quindi: suite esistente verde (nessuna
regressione), `npx tsc --noEmit` pulito, `npm run build` verde.

## Criteri di completamento

- La dashboard mostra due card affiancate, Prodotti a sinistra e Clienti a destra.
- Impostazioni mostra la card Account in cima, con le stesse righe e badge di
  prima, **anche quando Supabase non è collegato**.
- Sotto "Aggiorna piano" compare la descrizione in grigio, col testo esatto.
- `npm test`, `npx tsc --noEmit`, `npm run build` verdi.
