import type { ProductEligibilitySnapshot } from '@prisma/client';

export interface HistoryPoint {
  day: string;
  count: number;
}

/**
 * Costruisce la serie storica dei prodotti sincronizzabili a partire dagli snapshot.
 * Logica pura: riceve gli snapshot gia' letti e la data di riferimento come parametri,
 * cosi' e' testabile senza database.
 *
 * @param snapshots - Snapshot delle idoneita' (tipicamente gia' filtrati dal DB per shopId)
 * @param today - Data di riferimento per il calcolo dei 30 giorni (tipicamente Date.now())
 * @returns Array di punti ordinati cronologicamente, con day formattato in YYYY-MM-DD UTC
 */
export function buildHistorySeries(
  snapshots: ProductEligibilitySnapshot[],
  today: Date
): HistoryPoint[] {
  // Calcola la data limite: 30 giorni fa rispetto a today
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);

  return (
    snapshots
      // Filtra solo gli snapshot degli ultimi 30 giorni
      .filter((s) => s.day >= thirtyDaysAgo)
      // Ordina cronologicamente crescente
      .sort((a, b) => a.day.getTime() - b.day.getTime())
      // Trasforma in punti con day formattato in YYYY-MM-DD usando UTC
      // (i getter UTC evitano che in fuso positivo il giorno slitti indietro)
      .map((s) => ({
        day: formatDateUTC(s.day),
        count: s.eligibleCount,
      }))
  );
}

/**
 * Formatta una Date in YYYY-MM-DD usando i getter UTC.
 * Necessario perche' il campo day arriva da Prisma come Date, ma rappresenta
 * una data senza ora (tipo @db.Date). Usando i getter locali in fuso orario
 * positivo il giorno puo' slittare indietro.
 */
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
