/**
 * Quando ripartira' la sincronizzazione periodica.
 *
 * La regola e' quella che applica davvero il cron (`api.cron.sync`): l'ultima
 * corsa completata piu' l'intervallo del piano. Non e' una stima parallela — se
 * un giorno quella regola cambia, questo file va cambiato con lei, altrimenti
 * l'app promette un orario che non rispetta.
 *
 * C'e' pero' un secondo vincolo che il solo intervallo non racconta: il cron non
 * gira di continuo, gira a ore fisse. Un negozio "in scadenza" alle 04:00 non
 * viene sincronizzato alle 04:00 ma al primo passaggio utile del cron. Dirgli
 * "fra un'ora" sarebbe falso di un giorno.
 */

/** Ora UTC a cui gira il cron (vedi `crons` in vercel.json). */
export const CRON_HOUR_UTC = 3;

/**
 * Istante della prossima sincronizzazione, o `null` se non e' prevedibile
 * (nessuna corsa precedente: parte al primo giro utile e non c'e' un'attesa da
 * annunciare).
 */
export function nextSyncAt(
  lastCompletedAt: Date | null,
  intervalHours: number | null,
  now: Date,
  cronHourUtc: number = CRON_HOUR_UTC,
): Date | null {
  if (lastCompletedAt == null || intervalHours == null || !(intervalHours > 0)) {
    return null;
  }

  const dueAt = new Date(lastCompletedAt.getTime() + intervalHours * 3600 * 1000);
  // Gia' scaduta: il prossimo passaggio del cron la prende.
  const from = dueAt.getTime() > now.getTime() ? dueAt : now;

  // Primo passaggio del cron a partire da `from`.
  const run = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      cronHourUtc,
      0,
      0,
      0,
    ),
  );
  if (run.getTime() <= from.getTime()) {
    run.setUTCDate(run.getUTCDate() + 1);
  }
  return run;
}

/**
 * "2 giorni", "3 ore", "un minuto": quanto manca, in italiano.
 *
 * Una sola unita', la piu' grande che abbia senso: "1 giorno e 4 ore" e' piu'
 * preciso ma nessuno lo legge per decidere qualcosa, e la precisione qui e'
 * finta — dipende da quando passa il cron.
 */
export function formatCountdown(from: Date, to: Date): string | null {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return null;

  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return minutes <= 1 ? 'un minuto' : `${minutes} minuti`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "un'ora" : `${hours} ore`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? 'un giorno' : `${days} giorni`;
}
