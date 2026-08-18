import type { CSSProperties } from 'react';

/**
 * Larghezza del contenitore della configurazione.
 *
 * E' quella che una Page ha senza `fullWidth`, presa dall'espressione di
 * Polaris e non da un numero copiato: resta allineata anche se il tema cambia.
 *
 * La usano i passi della configurazione e la tab Piano, perche' mostrano le
 * stesse card: a larghezze diverse gli stessi quattro piani sembrano due cose
 * diverse, e il merchant che passa dall'una all'altra deve rileggerli.
 */
export const SETUP_CONTAINER: CSSProperties = {
  maxWidth:
    'calc(var(--pg-layout-width-primary-max) + var(--pg-layout-width-secondary-max) + var(--pg-layout-width-inner-spacing-base))',
  marginInline: 'auto',
  width: '100%',
};
