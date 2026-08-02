// Quota prodotti del piano: come si scrive nel badge e quando va avvisato il
// merchant. Sta qui, fuori dai componenti, perche' la stessa soglia decide il
// banner in due pagine diverse (dashboard e prodotti non idonei) e deve dire la
// stessa cosa in entrambe.

/** Nessun tetto (es. Lifetime): il limite si scrive cosi'. */
const UNLIMITED = '∞';

/** Quota consumata oltre la quale il merchant va avvisato. */
export const PRODUCT_LIMIT_WARN_RATIO = 0.85;

/** "54 / 100", oppure "54 / ∞" se il piano non ha tetto. */
export function productQuotaLabel(count: number, limit: number | null | undefined): string {
  return `${count} / ${limit == null ? UNLIMITED : limit}`;
}

/**
 * Soglia oltre la quale scatta l'avviso, in numero di prodotti.
 *
 * Arrotondata per eccesso: su un tetto di 20 l'85% cade a 17, non a 16,9 — cosi'
 * la soglia e' un numero che il merchant puo' riconoscere nel badge.
 */
export function productLimitThreshold(limit: number): number {
  return Math.ceil(limit * PRODUCT_LIMIT_WARN_RATIO);
}

export function isNearProductLimit(
  count: number,
  limit: number | null | undefined,
): boolean {
  if (limit == null || limit <= 0) return false;
  return count >= productLimitThreshold(limit);
}

/**
 * Testo dell'avviso, o null se non c'e' nulla da avvisare.
 *
 * Due formulazioni, perche' a tetto raggiunto "stai per raggiungere" sarebbe
 * falso: il merchant a quel punto ha gia' prodotti che restano fuori.
 */
export function productLimitMessage(
  count: number,
  limit: number | null | undefined,
): string | null {
  if (!isNearProductLimit(count, limit) || limit == null) return null;

  if (count >= limit) {
    return `Hai raggiunto il limite di prodotti sincronizzabili previsto dal tuo piano (${count} di ${limit}). I prodotti eccedenti non vengono sincronizzati.`;
  }
  return `Stai per raggiungere il limite di prodotti sincronizzabili previsto dal tuo piano (${count} di ${limit}). Raggiunta la soglia, i prodotti eccedenti non verranno sincronizzati.`;
}
