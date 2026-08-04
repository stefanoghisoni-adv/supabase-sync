import { useEffect, useState } from 'react';
import { useNavigation } from '@remix-run/react';

// useNavigation dice DOVE sta andando l'app, non DA DOVE e' partita. Bastava
// quello finche' l'unico modo di cambiare sezione era un pulsante della pagina;
// ma il merchant usa anche il menu laterale dell'admin, e li' ogni pulsante che
// porta alla stessa sezione si accendeva e si disabilitava insieme — un'attesa
// che nessuno aveva chiesto, su comandi che nessuno aveva premuto.
//
// Serve quindi anche il consenso di chi il clic l'ha ricevuto davvero.

export interface NavLoadingInput {
  /** Il pulsante e' stato premuto e non e' ancora arrivato da nessuna parte. */
  requested: boolean;
  /** Stato di useNavigation. */
  navigationState: 'idle' | 'loading' | 'submitting';
  /** Destinazione della navigazione in corso, se ce n'e' una. */
  navigatingTo: string | undefined;
  /** Dove porta questo pulsante. */
  path: string;
}

export function navButtonLoading(input: NavLoadingInput): boolean {
  if (!input.requested) return false;
  return input.navigationState === 'loading' && input.navigatingTo === input.path;
}

export interface NavLoading {
  /** Da passare a `loading` e `disabled` del pulsante. */
  loading: boolean;
  /** Da chiamare nell'onClick/onAction del pulsante. */
  start: () => void;
}

/**
 * Stato di attesa di un pulsante che porta a `path`, acceso solo se e' stato
 * quel pulsante a far partire la navigazione.
 */
export function useNavLoading(path: string): NavLoading {
  const navigation = useNavigation();
  const [requested, setRequested] = useState(false);

  // A navigazione finita si riparte da zero: senza, un pulsante premuto e poi
  // scavalcato dal menu laterale resterebbe armato per il giro dopo.
  useEffect(() => {
    if (navigation.state === 'idle') setRequested(false);
  }, [navigation.state]);

  return {
    loading: navButtonLoading({
      requested,
      navigationState: navigation.state,
      navigatingTo: navigation.location?.pathname,
      path,
    }),
    start: () => setRequested(true),
  };
}
