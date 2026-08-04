// Modulo puro: nessun import da un `.server`, cosi' il valore e' verificabile
// senza tirarsi dietro Prisma o le GraphQL di Shopify.

/**
 * Se l'addebito va creato come "di prova" per scelta esplicita di chi gestisce
 * l'app, indipendentemente dal tipo di negozio.
 *
 * Shopify rifiuta gli addebiti reali sui negozi di sviluppo, quindi la' l'app
 * passa gia' a `test: true` da sola. Su un negozio normale invece l'addebito e'
 * vero e viene pagato davvero: senza questo interruttore non ci sarebbe modo di
 * provare l'attivazione di un piano end-to-end senza spendere.
 *
 * Vale solo con il valore esatto `true`: qualsiasi altra cosa (assente, vuoto,
 * "false", "1") lascia gli addebiti reali. Un interruttore del genere acceso per
 * sbaglio in produzione regalerebbe l'app a tutti.
 */
export function forcedTestCharge(value: string | undefined | null): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}
