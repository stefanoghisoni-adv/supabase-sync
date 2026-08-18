import type { Dictionary } from '~/lib/i18n/context';

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

type Strings = Pick<Dictionary, 'authBanners'>;

function trackingSuspended(state: AuthState, t: Strings): string {
  return state === 'DISABLED'
    ? t.authBanners.trackingSuspended.disabled
    : t.authBanners.trackingSuspended.pending;
}

/**
 * Banner di sospensione da mostrare in cima alla dashboard, in ordine di
 * gravita'. Nessuno se va tutto bene.
 */
export function authorizationBanners(
  app: AuthState,
  tracking: AuthState,
  t: Strings,
): AuthorizationBanner[] {
  const banners: AuthorizationBanner[] = [];
  const trackingOn = tracking === 'ENABLED';

  // Il tracciamento continua a funzionare, ma sui dati fermi all'ultima
  // sincronizzazione: e' il motivo per cui le due autorizzazioni sono separate,
  // e il merchant deve sapere che i numeri non si aggiornano piu'.
  const stillOn = trackingOn ? t.authBanners.trackingStillOn : '';

  if (app === 'DISABLED') {
    banners.push({
      id: 'app',
      tone: 'critical',
      title: t.authBanners.appDisabled.title,
      message: t.authBanners.appDisabled.message + stillOn,
    });
  } else if (app === 'PENDING') {
    banners.push({
      id: 'app',
      tone: 'warning',
      title: t.authBanners.trialEnded.title,
      message: t.authBanners.trialEnded.message + stillOn,
    });
  }

  // Il tracciamento fermo si annuncia sempre, anche quando l'app e' sospesa:
  // sono due sospensioni diverse e si tolgono separatamente.
  if (!trackingOn) {
    banners.push({
      id: 'tracking',
      tone: tracking === 'DISABLED' ? 'critical' : 'warning',
      title: t.authBanners.trackingSuspended.title,
      message: trackingSuspended(tracking, t),
    });
  }

  return banners;
}
