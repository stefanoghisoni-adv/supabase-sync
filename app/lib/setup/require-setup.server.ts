import { redirect } from '@remix-run/node';
import { isSetupComplete } from './setup-state.server';

/**
 * Le pagine che esistono solo a configurazione conclusa.
 *
 * Finche' i passi sono aperti l'app ha una cosa sola da far fare, e il menu
 * mostra quella. Ma un menu non e' una difesa: restano gli indirizzi digitati a
 * mano, i segnalibri e i collegamenti di una sessione precedente. Chi arriva
 * cosi' torna dove il lavoro e' rimasto, invece di trovare una pagina che parla
 * di dati che non esistono ancora.
 *
 * Non e' un blocco e non e' un errore: e' un rimando alla stessa pagina che il
 * menu propone.
 */
export async function requireSetupComplete(shopDomain: string): Promise<void> {
  if (await isSetupComplete(shopDomain)) return;
  throw redirect('/');
}
