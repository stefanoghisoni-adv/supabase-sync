// Cosa dire al merchant quando qualcosa e' sospeso.
//
// Le autorizzazioni sono due e indipendenti: l'uso dell'app e il tracciamento.
// Spegnerne una non spegne l'altra, quindi il banner non puo' piu' dare per
// scontato che siano la stessa cosa — dire "tutto sospeso" a chi sta ancora
// tracciando sarebbe falso, e tacere del tracciamento fermo lascerebbe il
// merchant a cercare un guasto che non c'e'.

export type AuthState = 'ENABLED' | 'PENDING' | 'DISABLED';

export interface AuthorizationBanner {
  id: 'app' | 'tracking';
  tone: 'critical' | 'warning';
  title: string;
  message: string;
}

// Il tracciamento continua a funzionare, ma sui dati fermi all'ultima
// sincronizzazione: e' il motivo per cui le due autorizzazioni sono separate, e
// il merchant deve sapere che i numeri non si aggiornano piu'.
const TRACKING_STILL_ON =
  ' Il tracciamento resta attivo e continua a usare i dati già sincronizzati, che però non verranno più aggiornati.';

function trackingSuspended(state: AuthState): string {
  return state === 'DISABLED'
    ? 'Il tracciamento è sospeso per questo negozio: i dati già sincronizzati non sono al momento utilizzabili dal tuo strumento di tracciamento. Contatta il supporto.'
    : 'Il tracciamento è sospeso: i dati già sincronizzati non sono al momento utilizzabili dal tuo strumento di tracciamento. Aggiorna il piano per riattivarlo.';
}

/**
 * Banner di sospensione da mostrare in cima alla dashboard, in ordine di
 * gravita'. Nessuno se va tutto bene.
 */
export function authorizationBanners(
  app: AuthState,
  tracking: AuthState,
): AuthorizationBanner[] {
  const banners: AuthorizationBanner[] = [];
  const trackingOn = tracking === 'ENABLED';

  if (app === 'DISABLED') {
    banners.push({
      id: 'app',
      tone: 'critical',
      title: 'App disabilitata',
      message:
        "L'utilizzo dell'app è stato disabilitato per questo negozio: tutte le funzioni e le sincronizzazioni sono sospese." +
        (trackingOn ? TRACKING_STILL_ON : ''),
    });
  } else if (app === 'PENDING') {
    banners.push({
      id: 'app',
      tone: 'warning',
      title: 'Periodo di prova terminato',
      message:
        'Il periodo di prova è terminato: le funzioni dell’app e le sincronizzazioni sono sospese. Aggiorna il piano per riattivarle.' +
        (trackingOn ? TRACKING_STILL_ON : ''),
    });
  }

  // Il tracciamento fermo si annuncia sempre, anche quando l'app e' sospesa:
  // sono due sospensioni diverse e si tolgono separatamente.
  if (!trackingOn) {
    banners.push({
      id: 'tracking',
      tone: tracking === 'DISABLED' ? 'critical' : 'warning',
      title: 'Tracciamento sospeso',
      message: trackingSuspended(tracking),
    });
  }

  return banners;
}
