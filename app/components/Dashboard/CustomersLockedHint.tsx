import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, Box, Icon, Link, Text } from '@shopify/polaris';
import { LockIcon } from '@shopify/polaris-icons';

// Quanto si aspetta prima di chiudere: il tempo di attraversare lo stacco fra
// il lucchetto e il riquadro senza vederselo sparire sotto il puntatore.
const CLOSE_DELAY_MS = 150;

/**
 * Lucchetto della riga "Clienti" quando il piano non li include, con l'invito
 * ad aggiornare.
 *
 * Non e' un Tooltip: quello di Polaris ha `pointer-events: none`, quindi un
 * collegamento al suo interno si vede ma non si puo' cliccare — che e' proprio
 * cio' che serve qui. Un Popover ha invece contenuto interattivo; lo apriamo al
 * passaggio del puntatore, cosi' si comporta come il fumetto di prima, e resta
 * aperto finche' il puntatore e' sopra di lui.
 *
 * Anche il lucchetto resta un collegamento allo stesso posto: chi ci clicca
 * sopra arriva al piano senza dover centrare le due parole.
 */
export function CustomersLockedHint() {
  const [active, setActive] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    cancelClose();
    setActive(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setActive(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  const activator = (
    // I gestori del puntatore stanno su uno span nudo: nessun componente
    // Polaris li espone, e qui non c'e' nulla da impaginare.
    <span
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={scheduleClose}
    >
      <Link url="/plan" removeUnderline>
        {/* Il glifo del lucchetto e' disegnato dentro un viewBox 20 con ~4px
            vuoti a destra: senza questo recupero l'icona sembra rientrata
            rispetto al numero della riga sopra. */}
        <span style={{ display: 'block', marginInlineEnd: '-4px' }}>
          <Icon source={LockIcon} tone="subdued" />
        </span>
      </Link>
    </span>
  );

  return (
    <Popover
      active={active}
      activator={activator}
      onClose={() => setActive(false)}
      autofocusTarget="none"
      preferredPosition="above"
      preferredAlignment="right"
    >
      <div onMouseEnter={open} onMouseLeave={scheduleClose}>
        <Box padding="300" maxWidth="17rem">
          <Text as="p" variant="bodySm">
            <Link url="/plan">Aggiorna ora</Link> per integrare la sincronizzazione
            dei clienti
          </Text>
        </Box>
      </div>
    </Popover>
  );
}
