import type { ProductEligibilitySnapshot } from '@prisma/client';
import type { Locale } from '~/lib/i18n/locales';

export interface HistoryPoint {
  /** Giorno del mese, da 1 all'ultimo. */
  day: number;
  /** null = giorno non ancora arrivato: la linea si ferma a oggi. */
  count: number | null;
}

/**
 * Etichetta del mese mostrato dal grafico: "Agosto 2026", "August 2026".
 *
 * I nomi dei mesi non si tengono in un elenco nostro: sono la cosa che ogni
 * lingua sa gia' scrivere da se', e un elenco per lingua andrebbe rifatto a
 * ogni lingua nuova. In italiano la maiuscola iniziale la mettiamo noi — Intl
 * scrive "agosto", ma qui e' il titolo di un grafico.
 */
export function monthLabel(today: Date, locale: Locale): string {
  const written = new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(today);
  return written.charAt(0).toUpperCase() + written.slice(1);
}

/**
 * Serie dei prodotti sincronizzabili per il mese corrente: un punto per ogni
 * giorno, dal primo all'ultimo del mese.
 *
 * Gli snapshot sono uno al giorno, ma solo per i giorni in cui il negozio e'
 * stato visitato o il cron e' passato: i buchi vengono riempiti con l'ultimo
 * valore noto, perche' un giorno senza rilevazione non significa "zero prodotti
 * idonei", significa "come il giorno prima". Per lo stesso motivo il conteggio
 * parte dall'ultimo snapshot precedente al mese: un negozio che a fine mese
 * aveva gia' dei prodotti idonei non deve ricominciare da zero il primo.
 *
 * Prima del primo snapshot in assoluto il valore e' 0 — e' il periodo in cui non
 * c'era ancora nulla di sincronizzabile — mentre i giorni futuri restano vuoti:
 * disegnarli a zero racconterebbe un calo che non e' avvenuto.
 *
 * Le date sono lette in UTC perche' e' cosi' che gli snapshot sono registrati
 * (vedi today() in eligibility-snapshot.server).
 *
 * @param snapshots snapshot del negozio: quelli del mese, piu' — se c'e' — il
 *   piu' recente fra quelli precedenti, da cui parte il conteggio.
 * @param today data di riferimento (tipicamente adesso)
 */
export function buildMonthSeries(
  snapshots: ProductEligibilitySnapshot[],
  today: Date,
): HistoryPoint[] {
  // Nessuna rilevazione: non c'e' storia da raccontare, nemmeno una piatta a zero.
  if (snapshots.length === 0) return [];

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1);
  // Giorno 0 del mese successivo = ultimo giorno di questo mese.
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const currentDay = today.getUTCDate();

  const sorted = [...snapshots].sort((a, b) => a.day.getTime() - b.day.getTime());

  let carried = 0;
  const byDay = new Map<number, number>();
  for (const snapshot of sorted) {
    const time = snapshot.day.getTime();
    if (time < monthStart) {
      carried = snapshot.eligibleCount;
      continue;
    }
    const day = new Date(time);
    if (day.getUTCFullYear() === year && day.getUTCMonth() === month) {
      byDay.set(day.getUTCDate(), snapshot.eligibleCount);
    }
  }

  const points: HistoryPoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    if (day > currentDay) {
      points.push({ day, count: null });
      continue;
    }
    const measured = byDay.get(day);
    if (measured !== undefined) carried = measured;
    points.push({ day, count: carried });
  }

  return points;
}

/**
 * La data per esteso di un punto del grafico: sull'asse c'e' solo il giorno,
 * ma nel riquadro che compare al passaggio del puntatore "7" da solo non dice
 * di che mese si parli.
 *
 * `monthStart` e' il primo giorno del mese mostrato, in ISO. Se manca o il
 * giorno non e' leggibile si tiene quello che c'era: meglio un numero nudo di
 * una data inventata.
 */
export function pointDateLabel(
  dayKey: string | number,
  monthStart: string | null | undefined,
  locale: Locale,
): string {
  const raw = String(dayKey);
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > 31) return raw;
  if (!monthStart) return raw;

  const start = new Date(monthStart);
  if (Number.isNaN(start.getTime())) return raw;

  // Il mese per esteso, come nel sottotitolo della card: una data si legge
  // meglio di tre numeri separati da barre. Il giorno lo mettiamo noi perche'
  // quello vero e' il numero sull'asse, non la data di `monthStart`.
  const withDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day),
  );
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(withDay);
}
