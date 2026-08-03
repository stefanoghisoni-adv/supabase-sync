import type { ProductEligibilitySnapshot } from '@prisma/client';

export interface HistoryPoint {
  /** Giorno del mese, da 1 all'ultimo. */
  day: number;
  /** null = giorno non ancora arrivato: la linea si ferma a oggi. */
  count: number | null;
}

const MONTH_NAMES = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

/** Etichetta del mese mostrato dal grafico, es. "Agosto 2026". */
export function monthLabel(today: Date): string {
  return `${MONTH_NAMES[today.getUTCMonth()]} ${today.getUTCFullYear()}`;
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
): string {
  const raw = String(dayKey);
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > 31) return raw;
  if (!monthStart) return raw;

  const start = new Date(monthStart);
  if (Number.isNaN(start.getTime())) return raw;

  const dd = String(day).padStart(2, '0');
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${start.getUTCFullYear()}`;
}
